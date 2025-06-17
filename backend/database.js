const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data', 'dashboard.db');
console.log(`[DB] Database path set to: \${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[DB_ERROR] Could not connect to database', err.message, err.stack);
    throw err;
  }
  console.log('[DB] Connected to SQLite database.');
  // Enable foreign key support for this connection
  db.run("PRAGMA foreign_keys = ON;", (fkErr) => {
    if (fkErr) {
        console.error("[DB_ERROR] Could not enable foreign key support:", fkErr.message, fkErr.stack);
    } else {
        console.log("[DB] Foreign key support enabled for this connection.");
    }
  });
});

// SQL to create the users table (from previous step, ensure it's here)
const createUsersTableSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

// SQL to create/update the contract_abis table
// Making user_id NOT NULL and adding FOREIGN KEY constraint
const createContractAbisTableSql = `
CREATE TABLE IF NOT EXISTS contract_abis (
  address TEXT PRIMARY KEY,
  name TEXT,
  abi TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;
// Note on migrations for existing tables with data:
// If this table already existed with data and user_id was NULLABLE or didn't exist,
// simply changing to NOT NULL or adding the FK might fail or require default values/data cleanup.
// This schema is suitable for new setups or development where table recreation is acceptable.

db.serialize(() => {
  db.run(createUsersTableSql, (err) => {
    if (err) {
        console.error("[DB_ERROR] Error creating/ensuring 'users' table:", err.message, err.stack);
    } else {
        console.log("[DB] 'users' table ensured to exist.");
    }
  });

  db.run(createContractAbisTableSql, (err) => {
    if (err) {
        console.error("[DB_ERROR] Error creating/ensuring 'contract_abis' table:", err.message, err.stack);
    } else {
        console.log("[DB] 'contract_abis' table ensured to exist (with user_id NOT NULL and FK).");
    }
  });
});

module.exports = db;
