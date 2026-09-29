import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

/**
 * Import the realm into a running Keycloak, or repair an already-imported one.
 *
 * Keycloak skips `--import-realm` when the realm already exists, so a realm
 * created before the identity mappers were added keeps rejecting tokens with
 * the wrong `domainId`. This script makes the provider state reproducible
 * instead of relying on clicking through the admin console.
 *
 * Usage:
 *   node auth/keycloak/import.mjs                              # localhost:8081
 *   node auth/keycloak/import.mjs https://keycloak.example.com
 *
 * Admin credentials come from the environment when present, so a hosted
 * instance never needs its password written into a file:
 *   KC_ADMIN_USERNAME=admin KC_ADMIN_PASSWORD=... node auth/keycloak/import.mjs <origin>
 *
 * Otherwise they are read from `auth/keycloak/.runtime/credentials.json`, which
 * is gitignored. No secret or token is printed.
 */

const origin = (process.argv[2] || 'http://localhost:8081').replace(/\/+$/, '');
const realmName = 'laundry';

/**
 * Scopes that must exist and be attached to the public clients.
 *
 * `basic` and `roles` are Keycloak built-ins. Declaring `clientScopes` in a
 * realm import replaces the built-in set rather than extending it, so a realm
 * imported from `prepare.mjs` has neither unless they are re-created. Without
 * `basic` there is no `sub` claim and every real token is refused with `401`.
 */
const REQUIRED_SCOPES = ['basic', 'roles', 'laundry-identity'];
const PUBLIC_CLIENTS = ['laundry-web', 'laundry-mobile'];

const realmJson = JSON.parse(
  await readFile(new URL('./.runtime/laundry-realm.json', import.meta.url), 'utf8'),
);

/** Resolve admin credentials from the environment first, then the runtime file. */
async function adminCredentials() {
  if (process.env.KC_ADMIN_PASSWORD) {
    return {
      username: process.env.KC_ADMIN_USERNAME || 'admin',
      password: process.env.KC_ADMIN_PASSWORD,
    };
  }
  const stored = JSON.parse(
    await readFile(new URL('./.runtime/credentials.json', import.meta.url), 'utf8'),
  );
  return { username: 'laundry-admin', password: stored.admin };
}

async function request(path, options = {}) {
  return fetch(`${origin}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/json', ...options.headers },
  });
}

async function adminToken() {
  const { username, password } = await adminCredentials();
  const response = await request('/realms/master/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username,
      password,
    }),
  });
  assert.equal(
    response.status,
    200,
    `Admin login failed on ${origin}. Is the admin username/password current?`,
  );
  return (await response.json()).access_token;
}

/** Admin API relative to the realm; '' addresses the realm representation. */
function adminApi(token) {
  return async (path, options = {}) => {
    const response = await request(`/admin/realms/${realmName}${path}`, {
      ...options,
      headers: { authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok && response.status !== 409) {
      const body = await response.text();
      throw new Error(
        `${options.method || 'GET'} /admin/realms/${realmName}${path} -> ${response.status}: ${body.slice(0, 300)}`,
      );
    }
    return response;
  };
}

/**
 * Create the realm. A new realm is POSTed to `/admin/realms` (the collection),
 * not to `/admin/realms/<name>`; the latter answers 404 for a realm that does
 * not exist yet.
 */
async function importRealm(token) {
  const response = await request('/admin/realms', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(realmJson),
  });
  if (response.status === 409) {
    console.log(`realm '${realmName}' already exists; skipping creation`);
    return false;
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`POST /admin/realms -> ${response.status}: ${body.slice(0, 300)}`);
  }
  console.log(`realm '${realmName}' created`);
  return true;
}

/** A realm exists once its discovery document is served. */
async function realmExists() {
  const response = await request(`/realms/${realmName}/.well-known/openid-configuration`);
  return response.status === 200;
}

/** Create a client scope if missing, then reconcile its mappers. */
async function ensureClientScope(api, name) {
  const wanted = realmJson.clientScopes.find((s) => s.name === name);
  assert.ok(wanted, `scope '${name}' is not declared in the realm template`);

  let scope = (await (await api('/client-scopes')).json()).find((s) => s.name === name);
  if (!scope) {
    await api('/client-scopes', { method: 'POST', body: JSON.stringify(wanted) });
    scope = (await (await api('/client-scopes')).json()).find((s) => s.name === name);
    console.log(`client scope '${name}' created`);
  }

  const existing = await (await api(`/client-scopes/${scope.id}/protocol-mappers/models`)).json();
  for (const mapper of wanted.protocolMappers ?? []) {
    const found = existing.find((m) => m.name === mapper.name);
    if (found) {
      // The representation must carry the server-assigned id, or the update
      // is rejected.
      await api(`/client-scopes/${scope.id}/protocol-mappers/models/${found.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...mapper, id: found.id }),
      });
    } else {
      await api(`/client-scopes/${scope.id}/protocol-mappers/models`, {
        method: 'POST',
        body: JSON.stringify(mapper),
      });
    }
  }
  const count = wanted.protocolMappers?.length ?? 0;
  console.log(`client scope '${name}': ${count} mapper(s) ensured`);
  return scope;
}

/** Put every required scope on both public clients as a default scope. */
async function ensureClientScopeBinding(api, scopeByName) {
  for (const clientId of PUBLIC_CLIENTS) {
    const clients = await (await api(`/clients?clientId=${encodeURIComponent(clientId)}`)).json();
    const client = clients.find((c) => c.clientId === clientId);
    assert.ok(client, `client '${clientId}' not found in realm '${realmName}'`);

    const defaults = await (await api(`/clients/${client.id}/default-client-scopes`)).json();
    for (const name of REQUIRED_SCOPES) {
      if (defaults.some((s) => s.name === name)) {
        console.log(`'${clientId}': already carries '${name}'`);
        continue;
      }
      await api(`/clients/${client.id}/default-client-scopes/${scopeByName[name].id}`, {
        method: 'PUT',
      });
      console.log(`'${clientId}': '${name}' added to default client scopes`);
    }
  }
}

/**
 * Put the capability scopes a client may *request* on it as optional scopes.
 *
 * The web application serves staff and customer, so it must be able to ask for
 * `orders:write` even though a staff account will never be granted it. This is
 * additive and driven by the realm template, so a realm created from
 * `prepare.mjs` and a realm repaired by this script end up with the same
 * requestable set — without this, widening the template silently does nothing
 * on an already-imported realm, and the web client's login fails with
 * `invalid_scope` at the provider instead of at the service.
 */
async function ensureOptionalClientScopes(api, scopeByName) {
  for (const clientId of PUBLIC_CLIENTS) {
    const wanted = realmJson.clients.find((c) => c.clientId === clientId)?.optionalClientScopes ?? [];
    if (wanted.length === 0) continue;

    const clients = await (await api(`/clients?clientId=${encodeURIComponent(clientId)}`)).json();
    const client = clients.find((c) => c.clientId === clientId);
    assert.ok(client, `client '${clientId}' not found in realm '${realmName}'`);

    const current = await (await api(`/clients/${client.id}/optional-client-scopes`)).json();
    for (const name of wanted) {
      if (current.some((s) => s.name === name)) {
        console.log(`'${clientId}': already offers '${name}'`);
        continue;
      }
      const scope = scopeByName[name];
      assert.ok(scope, `optional scope '${name}' for '${clientId}' is not declared in the realm template`);
      await api(`/clients/${client.id}/optional-client-scopes/${scope.id}`, { method: 'PUT' });
      console.log(`'${clientId}': '${name}' added to optional client scopes`);
    }
  }
}

/** Ensure each fixture user carries the attributes the mappers publish. */
async function ensureUserAttributes(api) {
  const wanted = realmJson.users.filter((u) => u.attributes);
  const users = await (await api('/users?max=200')).json();

  for (const spec of wanted) {
    const user = users.find((u) => u.username === spec.username);
    assert.ok(user, `user '${spec.username}' not found in realm '${realmName}'`);
    const merged = { ...(user.attributes || {}), ...spec.attributes };
    await api(`/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...user, attributes: merged }),
    });
    const keys = Object.keys(spec.attributes).join(', ');
    console.log(`'${spec.username}': attributes ensured (${keys})`);
  }
}

/** Ensure fixture users retain the actor role used by the web client menu. */
async function ensureUserRoles(api) {
  const wantedUsers = realmJson.users.filter((user) => user.realmRoles?.length && !user.serviceAccountClientId);
  const users = await (await api('/users?max=200')).json();
  const allRoles = await (await api('/roles')).json();
  const roleByName = new Map(allRoles.map((role) => [role.name, role]));

  for (const spec of wantedUsers) {
    const user = users.find((candidate) => candidate.username === spec.username);
    assert.ok(user, `user '${spec.username}' not found in realm '${realmName}'`);
    const current = await (await api(`/users/${user.id}/role-mappings/realm`)).json();
    const currentNames = new Set(current.map((role) => role.name));
    const missing = spec.realmRoles
      .filter((name) => !currentNames.has(name))
      .map((name) => roleByName.get(name));
    assert.ok(missing.every(Boolean), `realm role missing for '${spec.username}'`);
    if (missing.length > 0) {
      await api(`/users/${user.id}/role-mappings/realm`, {
        method: 'POST',
        body: JSON.stringify(missing),
      });
      console.log(`'${spec.username}': realm role(s) ensured (${missing.map((role) => role.name).join(', ')})`);
    }
  }
}

/**
 * Declare the identity attributes in the realm's user profile.
 *
 * Keycloak 24+ validates users against a declarative profile, and an attribute
 * that is not declared there is silently discarded: the admin API answers
 * `204 No Content` and the value never appears on the user. The failure is
 * invisible from the API response, and the symptom downstream is worse — the
 * service falls back to `sub`, so every ownership comparison is a Keycloak
 * UUID against a domain identifier and every object is answered `404`.
 *
 * Declaring the two attributes is preferred over enabling
 * `unmanagedAttributePolicy`, which would accept any attribute at all.
 */
async function ensureUserProfile(api) {
  // `actor` is not read by the resource server, which derives the caller kind
  // from `realm_access.roles`. It is declared so the template's user
  // attributes are stored rather than silently dropped, which keeps the
  // read-back below meaningful for every attribute the template sets.
  const WANTED = ['fixture_domain_id', 'outlet_id', 'actor'];
  const profile = await (await api('/users/profile')).json();
  const declared = new Set((profile.attributes || []).map((a) => a.name));
  const missing = WANTED.filter((name) => !declared.has(name));

  if (missing.length === 0) {
    console.log(`user profile: ${WANTED.join(', ')} already declared`);
    return;
  }

  profile.attributes = [
    ...(profile.attributes || []),
    ...missing.map((name) => ({
      name,
      displayName: name
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      validations: {},
      annotations: {},
      // Readable by the user and by an administrator, writable by an
      // administrator only: these bind an identity to a domain object and must
      // not be self-assigned.
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      multivalued: false,
    })),
  ];

  await api('/users/profile', { method: 'PUT', body: JSON.stringify(profile) });
  console.log(`user profile: declared ${missing.join(', ')}`);
}

/**
 * Read the attributes back and assert they were actually stored.
 *
 * Without this read-back the script reports success for a write Keycloak
 * dropped, which is exactly how a realm can look configured while every
 * ownership rule in the service fails.
 */
async function verifyUserAttributes(api) {
  const wanted = realmJson.users.filter((u) => u.attributes);
  for (const spec of wanted) {
    const found = (await (await api(`/users?username=${encodeURIComponent(spec.username)}&exact=true`)).json())[0];
    assert.ok(found, `user '${spec.username}' not found in realm '${realmName}'`);
    const stored = found.attributes || {};
    for (const [name, value] of Object.entries(spec.attributes)) {
      assert.equal(
        stored[name]?.[0],
        value[0],
        `attribute '${name}' on '${spec.username}' was not stored (got ${JSON.stringify(stored[name])}); is it declared in the user profile?`,
      );
    }
    console.log(`'${spec.username}': attributes verified`);
  }
}

/**
 * Attach extra redirect URIs and web origins to a public client.
 *
 * Additive and idempotent: existing entries are never removed, so the local
 * development origin survives alongside the deployed one. Entries are matched
 * exactly, with no wildcard and no prefix matching.
 */
async function ensureClientOrigins(api, clientId, origins) {
  if (origins.length === 0) return;

  const clients = await (await api(`/clients?clientId=${encodeURIComponent(clientId)}`)).json();
  const client = clients.find((c) => c.clientId === clientId);
  assert.ok(client, `client '${clientId}' not found in realm '${realmName}'`);

  const redirectUris = new Set(client.redirectUris || []);
  const webOrigins = new Set(client.webOrigins || []);
  const added = [];

  for (const origin of origins) {
    const callback = `${origin}/callback`;
    if (!redirectUris.has(callback)) { redirectUris.add(callback); added.push(callback); }
    if (!webOrigins.has(origin)) { webOrigins.add(origin); added.push(origin); }
  }

  if (added.length === 0) {
    console.log(`'${clientId}': origins already registered`);
    return;
  }

  await api(`/clients/${client.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...client, redirectUris: [...redirectUris], webOrigins: [...webOrigins] }),
  });
  console.log(`'${clientId}': registered ${added.join(', ')}`);
}

/**
 * Read the mappers back and assert the claims the resource server depends on
 * are actually published by the scopes attached to the public clients.
 *
 * The check is on the mapper's `protocolMapper` type rather than on
 * `claim.name`, because `oidc-sub-mapper` publishes `sub` implicitly and
 * carries no `claim.name` config.
 */
async function verifyClaims(api, scopeByName) {
  const expected = {
    basic: ['oidc-sub-mapper'],
    roles: ['oidc-usermodel-realm-role-mapper', 'oidc-usermodel-client-role-mapper'],
    'laundry-identity': ['oidc-usermodel-attribute-mapper'],
  };

  for (const [name, wanted] of Object.entries(expected)) {
    const mappers = await (
      await api(`/client-scopes/${scopeByName[name].id}/protocol-mappers/models`)
    ).json();
    const types = mappers.map((m) => m.protocolMapper).sort();
    const claims = mappers
      .map((m) => m.config?.['claim.name'])
      .filter(Boolean)
      .sort();
    console.log(
      `'${name}': mapper(s) ${types.join(', ')}${claims.length ? ` | claims ${claims.join(', ')}` : ''}`,
    );
    for (const type of wanted) {
      assert.ok(types.includes(type), `scope '${name}' is missing mapper '${type}'`);
    }
  }

  // The identity scope must publish exactly the two claims the service reads,
  // and must not leak its own name into the capability `scope` claim.
  const identity = scopeByName['laundry-identity'];
  assert.equal(
    identity.attributes['include.in.token.scope'],
    'false',
    'laundry-identity must not appear in the scope claim',
  );
}

async function main() {
  const token = await adminToken();
  const api = adminApi(token);

  if (!(await realmExists())) {
    console.log(`realm '${realmName}' not found; creating it`);
    await importRealm(token);
  } else {
    console.log(`realm '${realmName}' present; repairing configuration`);
  }

  const scopeByName = {};
  for (const name of REQUIRED_SCOPES) {
    scopeByName[name] = await ensureClientScope(api, name);
  }
  await ensureClientScopeBinding(api, scopeByName);

  // Capability scopes are looked up rather than created: they are declared by
  // the realm template and must already exist. Reading them here lets
  // `ensureOptionalClientScopes` attach them to a client.
  const allScopes = await (await api('/client-scopes')).json();
  for (const scope of allScopes) {
    if (!scopeByName[scope.name]) scopeByName[scope.name] = scope;
  }
  await ensureOptionalClientScopes(api, scopeByName);
  // Profile first: an attribute that is not declared is discarded without an
  // error, so writing attributes before declaring them silently does nothing.
  await ensureUserProfile(api);
  await ensureUserAttributes(api);
  await ensureUserRoles(api);
  await verifyUserAttributes(api);

  // Keep both supported local dev origins registered. The realm import is only
  // applied when the realm is first created, so an existing Keycloak volume
  // must be repaired explicitly when the web client changes ports.
  const localOrigins = ['http://localhost:3000', 'http://localhost:5173'];
  const deployedOrigins = (process.env.WEB_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  await ensureClientOrigins(api, 'laundry-web', [...new Set([...localOrigins, ...deployedOrigins])]);

  await verifyClaims(api, scopeByName);

  const discovery = await request(`/realms/${realmName}/.well-known/openid-configuration`);
  assert.equal(discovery.status, 200, 'realm discovery document must be reachable');
  const doc = await discovery.json();

  console.log('');
  console.log('Realm is ready. Set these on the resource server:');
  console.log(`  OIDC_ISSUER=${doc.issuer}`);
  console.log(`  OIDC_JWKS_URI=${doc.jwks_uri}`);
  console.log('  OIDC_AUDIENCE=laundry-api');
  console.log('');
  console.log('No secret or token was printed.');
}

main().catch((error) => {
  console.error(`FAIL realm import. ${error.message}`);
  process.exitCode = 1;
});
