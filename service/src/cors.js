'use strict';

/**
 * CORS for the browser client, which is always on a different origin from
 * this service.
 *
 * The allowed list is explicit and is never reflected back. Reflecting
 * `req.headers.origin` looks specific while permitting every origin, and the
 * whole point of a list is that it can be read and audited (P5 §A.4.4).
 *
 * `Vary: Origin` is set on every response, not only on allowed ones. This
 * service sits behind Cloudflare; without `Vary` a cache can serve the
 * response built for one origin to a client from another.
 *
 * No `Access-Control-Allow-Credentials`: this service authenticates with a
 * Bearer token and never with a cookie, so the browser must not be told to
 * send credentials.
 */

const ALLOWED_METHODS = 'GET, POST, OPTIONS';

// `If-Match` and `If-None-Match` are not CORS-safelisted request headers, so
// a browser sends a preflight for them and the preflight fails unless they
// are named here. Conditional reads and writes (P5 §A.7, §A.8) depend on this.
const ALLOWED_HEADERS =
  'Authorization, Content-Type, Idempotency-Key, If-Match, If-None-Match';

// `ETag` and `X-Next-Cursor` are not CORS-safelisted response headers either.
// Without exposing them the client reads `null` for the version marker and the
// next cursor, which makes 304 polling and cursor pagination impossible.
const EXPOSED_HEADERS = 'ETag, Location, X-Next-Cursor, Retry-After';

function cors(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  return function corsMiddleware(req, res, next) {
    res.set('Vary', 'Origin');

    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.set('Access-Control-Expose-Headers', EXPOSED_HEADERS);
      res.set('Access-Control-Max-Age', '600');
    }

    // A preflight carries no Authorization header, so it can never be
    // authenticated. Answer it here, before `authenticate` runs, and answer it
    // identically for a disallowed origin: the browser decides whether the
    // real request may proceed by looking for Access-Control-Allow-Origin,
    // which is simply absent.
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  };
}

module.exports = { cors, ALLOWED_METHODS, ALLOWED_HEADERS, EXPOSED_HEADERS };
