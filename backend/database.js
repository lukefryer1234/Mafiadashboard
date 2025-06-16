const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define the path for the database file.
// Placing it in a 'data' subdirectory within 'backend'.
const dbPath = path.resolve(__dirname, 'data', 'dashboard.db');
const dbDir = path.dirname(dbPath);

// Ensure the data directory exists (Node.js will create it if it doesn't when writing the file,
// but for clarity and explicit control, we could use fs.mkdirSync if needed,
// however, sqlite3.Database will create the file if it doesn't exist, including the directory path if it's simple enough)
// For more complex scenarios or specific permissions, 'fs.mkdirSync(dbDir, { recursive: true });' might be used before this.

console.log(`[DB] Database path set to: \${dbPath}`);

// Initialize the database
// The database file will be created if it doesn't exist
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[DB_ERROR] Could not connect to database', err.message, err.stack);
    throw err; // Throw error to prevent app from starting in a bad state
  }
  console.log('[DB] Connected to SQLite database.');
});

// SQL to create the contract_abis table
const createTableSql = `
CREATE TABLE IF NOT EXISTS contract_abis (
  address TEXT PRIMARY KEY,
  name TEXT,
  abi TEXT NOT NULL,
  added_date DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

// Create the table
db.serialize(() => { // Use serialize to ensure sequential execution
  db.run(createTableSql, (err) => {
    if (err) {
      console.error("[DB_ERROR] Error creating contract_abis table", err.message, err.stack);
      // Application might still run if table already exists and is fine.
      // If it's a critical error, consider process.exit() or more robust error handling.
    } else {
      console.log("[DB] 'contract_abis' table ensured to exist.");
    }
  });
});

// Export the database connection
module.exports = db;
EOF
