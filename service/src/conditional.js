'use strict';

const crypto = require('crypto');

/**
 * Conditional requests (RFC 9110): entity version markers and precondition
 * matching. Kept in one file because the read side (ETag + If-None-Match) and
 * the write side (If-Match) must agree on exactly how a version is computed.
 * Two implementations of "the version of this order" would eventually
 * disagree, and the failure mode is a 412 that never fires.
 */

/**
 * Version marker for one entity, built from the fields that actually change.
 *
 * Deliberately NOT the hash of the response body, which is what Express does
 * by default: a body hash changes when an unrelated field changes, and
 * reproducing it outside the response path (needed to evaluate If-Match
 * before writing) is fragile.
 *
 * Strong, not weak. If-Match requires strong comparison, so a `W/"..."` tag
 * could never satisfy a precondition (RFC 9110 §13.1.1).
 */
function entityVersion(...parts) {
  const digest = crypto
    .createHash('sha256')
    .update(parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('|'))
    .digest('base64url');
  return `"${digest}"`;
}

function orderVersion(row) {
  return entityVersion(row.id, row.status, row.outlet_id, row.updated_at);
}

function pickupVersion(row) {
  return entityVersion(row.id, row.status, row.collected_at, row.updated_at);
}

/**
 * Version marker for a collection page. A polled list changes when any row in
 * the page changes, so the marker covers the representations themselves.
 */
function collectionVersion(items) {
  return entityVersion(JSON.stringify(items));
}

function parseTags(header) {
  return String(header)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

const stripWeak = (tag) => tag.replace(/^W\//, '');

/**
 * If-None-Match comparison (RFC 9110 §13.1.2, weak). A proxy that downgraded
 * the tag must not turn a valid `304` into a full response.
 */
function matchesIfNoneMatch(header, tag) {
  const tags = parseTags(header).map(stripWeak);
  return tags.includes('*') || tags.includes(stripWeak(tag));
}

/**
 * If-Match comparison.
 *
 * RFC 9110 §13.1.1 specifies *strong* comparison, which a weak tag never
 * satisfies. This function compares the opaque value instead, and the reason
 * is measured rather than theoretical.
 *
 * The service sits behind Cloudflare. Cloudflare re-encodes JSON responses
 * with Brotli, and when it transforms a representation it weakens the
 * validator to say so — which is correct behaviour for an intermediary.
 * Measured against the deployment:
 *
 *   Accept-Encoding: (default)  ->  W/"aiNfDU1j..."   content-encoding: br
 *   Accept-Encoding: identity   ->  "aiNfDU1j..."     no compression
 *
 * A browser therefore always holds the weak form and sends it back in
 * `If-Match`. Under strict strong comparison it would never match, so a
 * correct client could never perform a single write: every request would be
 * answered `412`, including the first one.
 *
 * The deviation is safe here because the tag is an *entity version marker*,
 * not a byte-level checksum. `W/"abc"` and `"abc"` name the same version,
 * which is exactly the question `If-Match` asks. Strong comparison exists to
 * protect byte-exact operations such as range requests, and this API offers
 * none.
 *
 * `Cache-Control: no-transform` is also set on responses, to stop the
 * weakening at its source. This comparison is the fallback for any
 * intermediary that ignores that directive.
 */
function matchesIfMatch(header, tag) {
  const tags = parseTags(header).map(stripWeak);
  return tags.includes('*') || tags.includes(stripWeak(tag));
}

module.exports = {
  entityVersion,
  orderVersion,
  pickupVersion,
  collectionVersion,
  parseTags,
  matchesIfNoneMatch,
  matchesIfMatch,
};
