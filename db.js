// db.js
const mysql = require("mysql2");

// ✅ Create MySQL connection pool
const pool = mysql.createPool({
  host: "crossover.proxy.rlwy.net",
  user: "root",
  password: "GQYpCRUCDzwgkPgWNfpUoDKnGsPYdUMT",
  database: "feedback",
  port: 10947,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ✅ Export for use in server.js
module.exports = pool;
