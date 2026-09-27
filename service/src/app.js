'use strict';

const config = require('./config');
// Required for its side effect (schema + migration) and kept for shutdown:
// the native handle must be closed while the runtime is still alive.
const database = require('./database');

const express = require('express');
const ordersRouter = require('./routes/orders');
const pickupsRouter = require('./routes/pickups');
const { authenticate } = require('./auth/authenticate');
const { cors } = require('./cors');
const {
  sendProblem,
  badRequest,
  internalError,
  notFound,
} = require('./problem');
const logger = require('./logger');

const app = express();

app.disable('x-powered-by');

// Strong, not weak. If-Match requires strong comparison (RFC 9110 §13.1.1),
// so a weak validator could never satisfy a precondition and every
// concurrent write would slip through as if it had one.
app.set('etag', 'strong');

// CORS first: a preflight carries no Authorization header and can never be
// authenticated, so it must be answered before `authenticate` runs.
app.use(cors(config.CORS_ALLOWED_ORIGINS));

// Intermediaries re-encode JSON (Cloudflare uses Brotli) and, because that
// transforms the representation, weaken the validator to `W/"..."`. A weak
// tag cannot satisfy `If-Match` under strict strong comparison, so a browser
// could never complete a single conditional write. `no-transform` asks them
// not to re-encode at all; `conditional.js` compares the opaque value as the
// fallback for any intermediary that ignores the directive.
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-transform');
  next();
});

app.use(express.json());

// Public: the platform probes readiness without a token.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Layer 1 — authentication. Everything below this line needs a valid token.
app.use(authenticate);

app.use('/v1/orders', ordersRouter);
app.use('/v1/pickups', pickupsRouter);

// Unmatched API paths must still answer with Problem Details: the contract
// promises every /v1 response carries a machine-readable problem body.
app.use('/v1', (req, res) => {
  sendProblem(res, notFound(req.originalUrl));
});

app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return sendProblem(
      res,
      badRequest('Malformed JSON in request body.', req.originalUrl),
    );
  }

  logger.error('Unhandled error', {
    ...logger.requestContext(req, 500),
    reason: err.message,
  });
  sendProblem(res, internalError(req.originalUrl));
});

if (require.main === module) {
  const server = app.listen(config.PORT, () => {
    console.log(`Laundry service listening on http://127.0.0.1:${config.PORT}`);
    console.log(`Health check: http://127.0.0.1:${config.PORT}/health`);
  });

  /**
   * Shut down deliberately instead of letting the process be killed.
   *
   * Railway sends SIGTERM on every redeploy. Without a handler Node begins
   * tearing down immediately, and the native SQLite statements that the stores
   * prepared at module scope are destroyed against an environment that no
   * longer exists — the process then aborts with exit code 134. The platform
   * reads a non-zero exit as a failed deploy even though the service was
   * healthy the whole time.
   *
   * Closing the server first stops accepting new work, then the database is
   * closed while the runtime is still intact.
   */
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down.`);
    server.close(() => {
      database.closeDatabase();
      process.exit(0);
    });
    // A connection that never goes idle must not hold the process open.
    setTimeout(() => {
      database.closeDatabase();
      process.exit(0);
    }, 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
