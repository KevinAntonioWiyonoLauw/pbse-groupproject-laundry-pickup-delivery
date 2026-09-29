import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const runtime = new URL('./.runtime/', import.meta.url);
await mkdir(runtime, { recursive: true, mode: 0o700 });

/**
 * Reuse the credentials that already exist, but always regenerate the realm
 * template.
 *
 * This script used to exit as soon as `credentials.json` was present, which
 * meant `laundry-realm.json` was written once and then frozen. Every later
 * change to this file — a new client scope, a widened `optionalClientScopes`,
 * an extra mapper — silently had no effect on any machine that had already run
 * the script, and the only symptom was a provider that kept rejecting a
 * request the code now makes.
 *
 * Passwords are the one thing that must survive: regenerating them would
 * invalidate every stored credential and break `import.mjs`, which reads them
 * back. The template is derived from this file, so it is rebuilt every run.
 */
let credentials = { admin: randomBytes(32).toString('base64url'), scheduledJob: randomBytes(32).toString('base64url'), users: {} };
let preserved = false;
try {
  const existing = JSON.parse(await readFile(new URL('credentials.json', runtime), 'utf8'));
  credentials = { ...credentials, ...existing };
  preserved = true;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const secret = () => randomBytes(32).toString('base64url');
const permissions = ['orders:read', 'orders:write', 'pickups:read', 'orders:fulfil', 'pickups:write'];
const actors = {
  customer: ['orders:read', 'orders:write'],
  driver: ['pickups:read', 'pickups:write'],
  staff: ['orders:read', 'pickups:read', 'orders:fulfil'],
};
const fixtures = [
  ['student-a', 'customer', 'cus_studentA', null], ['student-b', 'customer', 'cus_studentB', null],
  ['courier-a', 'driver', 'drv_courierA', null], ['courier-b', 'driver', 'drv_courierB', null],
  ['staff-outlet-a', 'staff', 'outlet_a', 'outlet_a'], ['staff-outlet-b', 'staff', 'outlet_b', 'outlet_b'],
];

// Claims the resource server maps into its internal principal. Keycloak does
// not publish user attributes in a token by itself: an explicit
// `oidc-usermodel-attribute-mapper` is required per attribute. Without these
// mappers `service/src/auth/principal.js` falls back to `sub`, so every
// ownership rule would compare a username against a domain identifier and
// every object would be answered `404`.
const identityMapper = (attribute) => ({
  name: `claim-${attribute.replaceAll('_', '-')}`,
  protocol: 'openid-connect',
  protocolMapper: 'oidc-usermodel-attribute-mapper',
  config: {
    'user.attribute': attribute,
    'claim.name': attribute,
    'jsonType.label': 'String',
    'access.token.claim': 'true',
    'id.token.claim': 'false',
    'userinfo.token.claim': 'false',
  },
});

/**
 * Keycloak ships a set of built-in client scopes (`basic`, `roles`, `profile`,
 * `email`, ...) that carry the standard claims. Declaring `clientScopes` in a
 * realm import REPLACES that set instead of extending it, so those built-ins
 * are absent unless they are declared here.
 *
 * Two of them are load-bearing for this service:
 *   - `basic` publishes `sub`. `principal.js` throws without it, so every
 *     request carrying a real token is answered `401`.
 *   - `roles` publishes `realm_access.roles`, which `principal.js` reads to
 *     decide the caller kind and the staff outlet fallback.
 *
 * Both use `include.in.token.scope: false`. Their mappers still run, but their
 * names stay out of the `scope` claim, which must carry capability scopes only.
 */
const basicScope = {
  name: 'basic',
  protocol: 'openid-connect',
  attributes: {
    'include.in.token.scope': 'false',
    'display.on.consent.screen': 'false',
    'consent.screen.text': '',
  },
  protocolMappers: [
    {
      name: 'sub',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-sub-mapper',
      consentRequired: false,
      config: { 'access.token.claim': 'true', 'id.token.claim': 'true' },
    },
  ],
};

const rolesScope = {
  name: 'roles',
  protocol: 'openid-connect',
  attributes: {
    'include.in.token.scope': 'false',
    'display.on.consent.screen': 'false',
  },
  protocolMappers: [
    {
      name: 'realm roles',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-realm-role-mapper',
      consentRequired: false,
      config: {
        'claim.name': 'realm_access.roles',
        'jsonType.label': 'String',
        multivalued: 'true',
        'access.token.claim': 'true',
        'id.token.claim': 'false',
        'userinfo.token.claim': 'false',
      },
    },
    {
      name: 'client roles',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-client-role-mapper',
      consentRequired: false,
      config: {
        'claim.name': `resource_access.\${client_id}.roles`,
        'jsonType.label': 'String',
        multivalued: 'true',
        'access.token.claim': 'true',
        'id.token.claim': 'false',
        'userinfo.token.claim': 'false',
      },
    },
  ],
};

// `include.in.token.scope: false` keeps the scope name out of the `scope`
// claim, so the identity scope can never be mistaken for a capability scope.
const identityScope = {
  name: 'laundry-identity',
  protocol: 'openid-connect',
  attributes: { 'include.in.token.scope': 'false' },
  protocolMappers: [identityMapper('fixture_domain_id'), identityMapper('outlet_id')],
};

const publicClient = (clientId, callbacks, origins, scopes) => ({
  clientId, enabled: true, protocol: 'openid-connect', publicClient: true,
  standardFlowEnabled: true, implicitFlowEnabled: false,
  directAccessGrantsEnabled: false, serviceAccountsEnabled: false,
  fullScopeAllowed: false, redirectUris: callbacks, webOrigins: origins,
  attributes: {
    'pkce.code.challenge.method': 'S256',
    'use.refresh.tokens': 'true',
    // Keycloak issues an offline token only when BOTH the client and the user
    // are allowed to use one. Without these two switches, requesting
    // `offline_access` is accepted at the authorize step and then fails at the
    // token endpoint with "Offline tokens not allowed for the user or client".
    // The web client needs it: the access token lives 300 seconds, and a
    // browser session has to outlive that without a re-login.
    'offline.access': 'true',
  },
  defaultClientScopes: ['basic', 'roles', 'laundry-audience', 'laundry-identity'],
  optionalClientScopes: scopes,
});
const realm = {
  realm: 'laundry', enabled: true, sslRequired: 'external',
  registrationAllowed: false, resetPasswordAllowed: false, rememberMe: false,
  loginWithEmailAllowed: false, bruteForceProtected: true,
  accessTokenLifespan: 300, ssoSessionIdleTimeout: 1800, ssoSessionMaxLifespan: 28800,
  revokeRefreshToken: true, refreshTokenMaxReuse: 0,
  defaultSignatureAlgorithm: 'RS256',
  roles: { realm: [
    ...permissions.map(name => ({ name })),
    ...Object.entries(actors).map(([name, roles]) => ({ name, composite: true, composites: { realm: roles } })),
    // Keycloak checks this role before it will mint an offline token for a
    // user. The `offline_access` client scope adds the role requirement; this
    // is the role itself. Both are needed, together with the client attribute
    // of the same name.
    { name: 'offline_access' },
  ] },
  clientScopes: [
    ...permissions.map(name => ({ name, protocol: 'openid-connect', attributes: { 'include.in.token.scope': 'true' } })),
    basicScope,
    rolesScope,
    { name: 'laundry-audience', protocol: 'openid-connect', attributes: { 'include.in.token.scope': 'false' },
      protocolMappers: [{ name: 'laundry-api', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper',
        config: { 'included.custom.audience': 'laundry-api', 'access.token.claim': 'true', 'id.token.claim': 'false' } }] },
    identityScope,
    // Keycloak ships `offline_access` as a built-in scope, but a realm exported
    // or re-imported without it does not carry it. `import.mjs` only attaches
    // optional scopes it can find by name, so `offline_access` must be declared
    // here or the client never offers it. When the client does not offer it,
    // asking for it makes Keycloak reject the WHOLE authorization request with
    // "Invalid scopes", even for scopes that are otherwise valid.
    { name: 'offline_access', protocol: 'openid-connect', attributes: { 'include.in.token.scope': 'true' } },
  ],
  // A scope is available only when the user/service account has the matching role.
  // With `fullScopeAllowed: false` only scope-mapped roles reach the token, so the
  // actor roles (`customer`/`driver`/`staff`) are mapped to the `roles` scope.
  // Without this the `realm_access.roles` claim would carry only capability names,
  // and `principal.js` could not tell a staff caller from a customer one.
  scopeMappings: [
    ...permissions.map(name => ({ clientScope: name, roles: [name] })),
    { clientScope: 'roles', roles: Object.keys(actors) },
  ],
  clients: [
    // The web application serves both roles, and P5 §A.2.2 requires the menu
    // rendered for staff and for customer to differ. That needs `orders:write`
    // to be requestable by this client. Widening the requestable set does not
    // widen the granted set: `fullScopeAllowed: false` plus `scopeMappings`
    // means the grant is still decided by the user's role, so a staff account
    // still never receives `orders:write` and a customer never receives
    // `orders:fulfil`.
    //
    // `pickups:write` is deliberately absent: it belongs to the driver actor,
    // and the web client serves staff and customer only. Asking for it makes
    // Keycloak reject the whole authorization request with
    // "Invalid scopes", because a client can only request the scopes it
    // offers. Keep `NEXT_PUBLIC_OIDC_SCOPE` in clients/web/.env.example in
    // step with this list.
    publicClient('laundry-web', ['http://localhost:3000/callback', 'http://localhost:5173/callback'], ['http://localhost:3000', 'http://localhost:5173'],
      [...new Set([...actors.staff, ...actors.customer, 'offline_access'])]),
    publicClient('laundry-mobile', ['id.ac.ugm.laundry://oauth/callback'], [], [...actors.customer, ...actors.driver]),
    { clientId: 'laundry-scheduled-job', enabled: true, protocol: 'openid-connect',
      publicClient: false, clientAuthenticatorType: 'client-secret', secret: credentials.scheduledJob,
      standardFlowEnabled: false, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true, fullScopeAllowed: false, redirectUris: [], webOrigins: [],
      attributes: { 'use.refresh.tokens': 'false', 'client_credentials.use_refresh_token': 'false' },
      defaultClientScopes: ['laundry-audience'], optionalClientScopes: ['orders:read', 'pickups:read'] },
  ],
  users: [
    ...fixtures.map(([username, actor, domainId, outletId]) => {
      // Reuse the stored password when one exists. Generating a new one on
      // every run would silently invalidate every account: the realm template
      // is regenerated each time, and `import.mjs` writes these values back to
      // the provider, so a fresh password here means every fixture user's
      // credentials change underneath whoever is holding them.
      const password = credentials.users[username] ?? secret();
      credentials.users[username] = password;
      // `outlet_id` is present only for staff: a staff principal acts for
      // exactly one outlet, and that binding must come from the provider so a
      // caller cannot choose which outlet it represents.
      const attributes = { actor: [actor], fixture_domain_id: [domainId] };
      if (outletId) attributes.outlet_id = [outletId];
      return { username, firstName: username, lastName: 'Test', email: `${username}@example.invalid`,
        enabled: true, requiredActions: [], realmRoles: [actor, 'offline_access'],
        attributes,
        credentials: [{ type: 'password', value: password, temporary: false }] };
    }),
    { username: 'service-account-laundry-scheduled-job', enabled: true,
      serviceAccountClientId: 'laundry-scheduled-job', realmRoles: ['orders:read', 'pickups:read'] },
  ],
};
// Parent directory is 0700. Import file must be readable by the container user.
await writeFile(new URL('laundry-realm.json', runtime), JSON.stringify(realm, null, 2), { mode: 0o644 });
await writeFile(new URL('.env', runtime), `KC_BOOTSTRAP_ADMIN_PASSWORD=${credentials.admin}\n`, { mode: 0o600 });
await writeFile(new URL('credentials.json', runtime), JSON.stringify(credentials, null, 2), { mode: 0o600 });
console.log(preserved
  ? 'Realm template regenerated; existing credentials preserved.'
  : 'Local realm and private credentials generated in auth/keycloak/.runtime/. No secrets printed.');
