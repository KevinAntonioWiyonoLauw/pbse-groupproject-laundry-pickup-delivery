'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const serviceRoot = path.resolve(__dirname, '..');
const dbPath = path.resolve(serviceRoot, config.DATABASE_FILE);
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schemaSQL = fs.readFileSync(
  path.resolve(serviceRoot, 'db', 'schema.sql'),
  'utf8',
);

/**
 * Migrate a pre-P4 database in place.
 *
 * `CREATE TABLE IF NOT EXISTS` never widens an existing table, so a database
 * created by P3 keeps its old `orders` shape. Dropping and recreating it would
 * destroy data, so the P4 column is added with ALTER TABLE instead.
 *
 * This must run *before* schema.sql: the P4 schema creates an index on
 * `orders.outlet_id`, and on a P3 database that column does not exist yet.
 * On a brand-new database `orders` does not exist at all, so this is a no-op
 * and schema.sql creates the table with the column already present.
 */
function migrate() {
  const ordersExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'orders'",
    )
    .get();
  if (!ordersExists) return;

  const columns = db.pragma('table_info(orders)').map((column) => column.name);
  if (!columns.includes('outlet_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN outlet_id TEXT');
  }
}

migrate();
db.exec(schemaSQL);

/**
 * Close the handle while the process is still fully alive.
 *
 * Every store prepares its statements at module scope, so they are still open
 * when the process ends. Without an explicit close, Node tears down the V8
 * environment first and the native `Statement` destructors run against an
 * already-destroyed environment, which aborts the process:
 *
 *   Statement::~Statement() [better_sqlite3.node]
 *   node::RemoveEnvironmentCleanupHook(...) at ../src/api/hooks.cc:142
 *   Assertion failed: (env) != nullptr
 *   Aborted  (exit code 134)
 *
 * The crash happens on the way out, so the service itself keeps working — but
 * a platform that watches the exit code (Railway sends SIGTERM on every
 * redeploy) reads `134` as a failed shutdown and reports the deploy as
 * crashed. Closing here, before the signal handler returns, keeps the
 * destructors on a live environment.
 */
function closeDatabase() {
  if (!db.open) return;
  try {
    db.close();
  } catch {
    // Nothing useful can be done if the handle is already unusable; the
    // process is exiting either way.
  }
}

module.exports = db;
module.exports.closeDatabase = closeDatabase;
