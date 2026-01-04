// db/sqlserver.js
import { ConnectionPool } from 'mssql';
require('dotenv').config();

const sql = require('mssql');
require('dotenv').config();
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: { encrypt: false, enableArithAbort: true },
  pool: { max: parseInt(process.env.DB_MAX_POOL || '10', 10), min: parseInt(process.env.DB_MIN_POOL || '0', 10), idleTimeoutMillis: 30000 }
};

let poolPromise = null;
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().then(p => { console.log('Connected to SQL Server'); return p; })
      .catch(err => { console.error('SQL Server connection failed', err); process.exit(1); });
  }
  return poolPromise;
}

module.exports = {
  sql,
  getPool,
  // query helper for convenience (returns recordset)
  query: async (text, params = {}) => {
    const pool = await getPool();
    const req = pool.request();
    for (const [k, v] of Object.entries(params)) req.input(k, v);
    const res = await req.query(text);
    return res;
  }
};
