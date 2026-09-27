'use strict';

function createProblem(type, title, status, detail, instance, extras) {
  const body = { type, title, status, detail, instance };
  if (extras) Object.assign(body, extras);
  return body;
}

function sendProblem(res, problem) {
  res.status(problem.status).type('application/problem+json').json(problem);
}

function badRequest(detail, instance, extras) {
  return createProblem(
    'https://api.example.com/problems/bad-request',
    'Bad request',
    400,
    detail,
    instance,
    extras,
  );
}

function notFound(instance) {
  // Deliberately constant. "The object does not exist" and "the object exists
  // but is not accessible to this caller" must produce byte-identical
  // responses, otherwise the body itself enumerates identifiers.
  return createProblem(
    'https://api.example.com/problems/not-found',
    'Resource not found',
    404,
    'The requested resource was not found.',
    instance,
  );
}

function idempotencyConflict(detail, instance) {
  return createProblem(
    'https://api.example.com/problems/idempotency-conflict',
    'Idempotency key conflict',
    409,
    detail,
    instance,
  );
}

function orderNotCancellable(detail, instance, currentStatus, allowedStatuses) {
  return createProblem(
    'https://api.example.com/problems/order-not-cancellable',
    'Order cannot be cancelled',
    409,
    detail,
    instance,
    { currentStatus, allowedStatuses },
  );
}

function unprocessable(detail, instance, extras) {
  return createProblem(
    'https://api.example.com/problems/validation-failed',
    'Validation failed',
    422,
    detail,
    instance,
    extras,
  );
}

/**
 * The entity changed between the read that produced the caller's version
 * marker and this write. A normal condition, not a system failure: the client
 * is expected to refresh, re-render, and explain it in domain terms rather
 * than show a generic error banner (P5 §A.8.2).
 */
function preconditionFailed(detail, instance) {
  return createProblem(
    'https://api.example.com/problems/precondition-failed',
    'Precondition failed',
    412,
    detail,
    instance,
  );
}

function internalError(instance) {
  return createProblem(
    'https://api.example.com/problems/internal-error',
    'Internal server error',
    500,
    'An unexpected error occurred.',
    instance,
  );
}

function unauthorized(instance, error = 'invalid_token') {
  return createProblem(
    'https://api.example.com/problems/unauthorized',
    'Unauthorized',
    401,
    'Authentication is required to access this resource.',
    instance,
    { error },
  );
}

function forbidden(instance, scopes) {
  return createProblem(
    'https://api.example.com/problems/forbidden',
    'Forbidden',
    403,
    'The authenticated principal does not have the required scope.',
    instance,
    { requiredScopes: scopes },
  );
}

/**
 * Turn the human-readable validation messages into the machine-readable
 * `invalid-params` member, so a client can put each reason on its own field
 * instead of parsing one joined sentence (P5 §A.6.1).
 *
 * Each message is written as "<field> <reason>", which is also how
 * `invalidFields` derives the names. Splitting on the first space keeps both
 * members derived from one source, so they cannot drift apart.
 */
function invalidParamsFrom(errors) {
  return errors.map((message) => {
    const cut = message.indexOf(' ');
    return cut === -1
      ? { name: message, reason: '' }
      : { name: message.slice(0, cut), reason: message.slice(cut + 1) };
  });
}

function validationExtras(errors) {
  return {
    invalidFields: errors.map((message) => message.split(' ')[0]),
    'invalid-params': invalidParamsFrom(errors),
  };
}

module.exports = {
  createProblem,
  sendProblem,
  invalidParamsFrom,
  validationExtras,
  badRequest,
  notFound,
  idempotencyConflict,
  orderNotCancellable,
  unprocessable,
  preconditionFailed,
  internalError,
  unauthorized,
  forbidden,
};
