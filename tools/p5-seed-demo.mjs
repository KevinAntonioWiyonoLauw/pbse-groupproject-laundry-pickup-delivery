'use strict';

/**
 * Seed the demo data the Session 7 rehearsal needs, against a deployed service.
 *
 * Why this exists: the API exposes no "create demo order" operation, and the
 * Railway database is ephemeral — it is wiped on every redeploy. The rehearsal
 * needs at least one `pending_pickup` order for the W1 workflow ("staff accepts
 * an incoming order") and one `processing` order for the `409` rejection demo.
 *
 * This script is ADDITIVE and idempotent in spirit: it tops up the counts to the
 * target using fresh orders, and never deletes anything. It only creates orders
 * for `student-a`, the customer account published in the README.
 *
 * Usage:
 *   node tools/p5-seed-demo.mjs <api-origin> <keycloak-origin> <web-origin>
 *
 * It mints real tokens with Authorization Code + PKCE (reusing the passwords in
 * auth/keycloak/.runtime/credentials.json, which never leave the machine) and
 * sends Idempotency-Key UUID v4 on every write, as the contract requires.
 * Tokens are never printed, logged, or placed in a URL.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [apiOrigin, kcOrigin, webOrigin] = process.argv.slice(2);
if (!apiOrigin || !kcOrigin) {
  console.error('usage: node tools/p5-seed-demo.mjs <api-origin> <keycloak-origin> [web-origin]');
  process.exit(1);
}
const api = apiOrigin.replace(/\/+$/, '');
const issuer = `${kcOrigin.replace(/\/+$/, '')}/realms/laundry`;
const redirect = `${(webOrigin || 'http://localhost:3000').replace(/\/+$/, '')}/callback`;

const ROOT = path.resolve(import.meta.dirname, '..');
const credentials = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'auth', 'keycloak', '.runtime', 'credentials.json'), 'utf8'),
);

async function pkceLogin(clientId, username, scope) {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: `openid ${scope}`,
    state: crypto.randomBytes(8).toString('hex'),
    nonce: crypto.randomBytes(8).toString('hex'),
    code_challenge_method: 'S256',
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
  });
  const cookies = new Map();
  const withCookies = async (url, opts = {}) => {
    const res = await fetch(url, {
      ...opts,
      redirect: 'manual',
      headers: { ...opts.headers, Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const c of res.headers.getSetCookie()) {
      const part = c.split(';')[0];
      const i = part.indexOf('=');
      cookies.set(part.slice(0, i), part.slice(i + 1));
    }
    return res;
  };
  const page = await withCookies(`${issuer}/protocol/openid-connect/auth?${params}`);
  const action = (await page.text()).match(/<form[^>]*action="([^"]+)"/i)?.[1]?.replaceAll('&amp;', '&');
  if (!action) throw new Error('login form not found');
  const login = await withCookies(action, {
    method: 'POST',
    body: new URLSearchParams({ username, password: credentials.users[username], credentialId: '' }),
  });
  const loc = login.headers.get('location');
  if (!loc) throw new Error(`login did not redirect for ${username} (${login.status})`);
  const code = new URL(loc).searchParams.get('code');
  const tokenRes = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirect, code, code_verifier: verifier }),
  });
  if (tokenRes.status !== 200) throw new Error(`token exchange failed: ${tokenRes.status}`);
  return (await tokenRes.json()).access_token;
}

const list = async (token, p) => {
  const res = await fetch(`${api}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  return Array.isArray(body) ? body : body.items ?? [];
};

const createOrder = async (token, customerId) => {
  const res = await fetch(`${api}/v1/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      customerId,
      serviceType: 'wash_fold',
      weightKg: 3,
      pickupAddress: 'Jl. Demo P5 No. 1, Jakarta',
    }),
  });
  return { status: res.status, body: await res.json() };
};

const customerId = 'cus_studentA';
const TARGET_PENDING = 2; // one to accept for W1, one spare
const TARGET_PROCESSING = 1; // for the 409 rejection demo

const student = await pkceLogin('laundry-web', 'student-a', 'orders:read orders:write');

let orders = await list(student, '/v1/orders');
let pending = orders.filter((o) => o.status === 'pending_pickup').length;
let processing = orders.filter((o) => o.status === 'processing').length;
console.log(`before: pending_pickup=${pending}, processing=${processing}`);

while (pending < TARGET_PENDING) {
  const { status, body } = await createOrder(student, customerId);
  if (status !== 201) throw new Error(`create order -> ${status}: ${JSON.stringify(body)}`);
  pending += 1;
  console.log(`created order ${body.id} (pending_pickup)`);
}

orders = await list(student, '/v1/orders');
processing = orders.filter((o) => o.status === 'processing').length;
console.log(`\nafter: pending_pickup=${orders.filter((o) => o.status === 'pending_pickup').length}, processing=${processing}`);

console.log('\nSeed done. For the "processing" order used by the 409 demo, accept one');
console.log('pending order as staff-outlet-a in the app, OR run verify-deployment.mjs.');
console.log('Remember: a redeploy wipes this data — seed AFTER the final deploy.');
