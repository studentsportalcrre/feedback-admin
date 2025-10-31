require("dotenv").config();
const mysql = require("mysql2");

const pool = mysql.createPool({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  port: process.env.PORT,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false } // ✅ Important for Render + Railway
});

module.exports = pool;
