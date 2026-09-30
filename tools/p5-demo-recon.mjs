'use strict';

/**
 * Read-only reconnaissance of the deployed service: how many orders exist and
 * in which status, per the two demo accounts. Mints real tokens via PKCE
 * (reusing prepare.mjs credentials) and prints COUNTS and STATUS ONLY — never a
 * token, and never a customer identifier beyond the ones already published in
 * the README.
 *
 *   node tools/p5-demo-recon.mjs <api-origin> <keycloak-origin> <web-origin>
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [apiOrigin, kcOrigin, webOrigin] = process.argv.slice(2);
if (!apiOrigin || !kcOrigin) {
  console.error('usage: node tools/p5-demo-recon.mjs <api-origin> <keycloak-origin> [web-origin]');
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
  const code = new URL(login.headers.get('location')).searchParams.get('code');
  const tokenRes = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirect, code, code_verifier: verifier }),
  });
  if (!res_ok(tokenRes.status)) throw new Error(`token exchange ${tokenRes.status}`);
  return (await tokenRes.json()).access_token;
}
const res_ok = (s) => s === 200;

const summarize = (orders, label) => {
  const byStatus = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  console.log(`${label}: ${orders.length} order`);
  for (const [status, n] of Object.entries(byStatus).sort()) console.log(`   - ${status}: ${n}`);
};

const get = (token, p) => fetch(`${api}${p}`, { headers: { Authorization: `Bearer ${token}` } });

const student = await pkceLogin('laundry-web', 'student-a', 'orders:read orders:write');
const staff = await pkceLogin('laundry-web', 'staff-outlet-a', 'orders:read orders:fulfil');

const studentOrders = (await (await get(student, '/v1/orders')).json());
const staffOrders = (await (await get(staff, '/v1/orders')).json());
summarize(Array.isArray(studentOrders) ? studentOrders : studentOrders.items ?? [], 'student-a (customer)');
summarize(Array.isArray(staffOrders) ? staffOrders : staffOrders.items ?? [], 'staff-outlet-a (staff)');

const pickups = await (await get(staff, '/v1/pickups')).json();
const pickupList = Array.isArray(pickups) ? pickups : pickups.items ?? [];
console.log(`staff-outlet-a pickups: ${pickupList.length}`);

console.log('\nNOTE: demo needs at least one pending_pickup for W1 (staff intake).');
