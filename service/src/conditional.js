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
 * If-None-Match uses weak comparison (RFC 9110 §13.1.2): a proxy that
 * downgraded the tag to weak must not turn a valid 304 into a full response.
 */
function matchesWeak(header, tag) {
  const tags = parseTags(header).map(stripWeak);
  return tags.includes('*') || tags.includes(stripWeak(tag));
}

/**
 * If-Match uses strong comparison (RFC 9110 §13.1.1): a weak tag never
 * matches. This is why `entityVersion` must not emit one.
 */
function matchesStrong(header, tag) {
  const tags = parseTags(header);
  return tags.includes('*') || tags.includes(tag);
}

module.exports = {
  entityVersion,
  orderVersion,
  pickupVersion,
  collectionVersion,
  parseTags,
  matchesWeak,
  matchesStrong,
};
