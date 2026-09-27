'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const REQUIRED = [
  'PORT',
  'DATABASE_FILE',
  'OIDC_ISSUER',
  'OIDC_JWKS_URI',
  'OIDC_AUDIENCE',
];

for (const key of REQUIRED) {
  if (!process.env[key] || process.env[key].trim() === '') {
    console.error(`FATAL  Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const port = parseInt(process.env.PORT, 10);
if (Number.isNaN(port) || port < 1 || port > 65535) {
  console.error('FATAL  PORT must be a valid port number (1-65535)');
  process.exit(1);
}

// Origins the browser client is served from. A comma-separated list, read
// once at startup. Empty is a valid value: it means no browser origin is
// allowed, which is the correct default for a service that is only called by
// tests and server-side clients.
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

for (const origin of CORS_ALLOWED_ORIGINS) {
  // An entry that is not an exact origin silently never matches, and the
  // symptom is a browser CORS failure that looks like a server problem.
  if (!/^https?:\/\/[^/]+$/.test(origin)) {
    console.error(
      `FATAL  CORS_ALLOWED_ORIGINS entry must be a bare origin (scheme://host[:port]), got: ${origin}`,
    );
    process.exit(1);
  }
}

module.exports = Object.freeze({
  PORT: port,
  DATABASE_FILE: process.env.DATABASE_FILE,
  NODE_ENV: process.env.NODE_ENV || 'development',
  OIDC_ISSUER: process.env.OIDC_ISSUER,
  OIDC_JWKS_URI: process.env.OIDC_JWKS_URI,
  OIDC_AUDIENCE: process.env.OIDC_AUDIENCE,
  CORS_ALLOWED_ORIGINS,
});
