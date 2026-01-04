// db/postgres.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PG_USER || process.env.DB_USER,
  host: process.env.PG_HOST || process.env.DB_SERVER || 'localhost',
  database: process.env.PG_DATABASE || process.env.DB_DATABASE || 'profiledb',
  password: process.env.PG_PASSWORD || process.env.DB_PASS,
  port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432', 10),
  max: parseInt(process.env.DB_MAX_POOL || '10', 10),
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => console.error('Unexpected Postgres client error', err));

async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}
async function one(text, params) {
  const res = await query(text, params);
  return res.rows[0];
}
async function insert(table, obj) {
  const keys = Object.keys(obj);
  const cols = keys.map(k => `"${k}"`).join(',');
  const vals = keys.map((_, i) => `$${i+1}`).join(',');
  const params = keys.map(k => obj[k]);
  const q = `INSERT INTO "${table}" (${cols}) VALUES (${vals}) RETURNING *`;
  const res = await query(q, params);
  return res.rows[0];
}
async function update(table, idField, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) throw new Error('No fields provided');
  const set = keys.map((k, i) => `"${k}" = $${i+1}`).join(',');
  const params = keys.map(k => fields[k]);
  params.push(id);
  const q = `UPDATE "${table}" SET ${set} WHERE "${idField}" = $${keys.length+1} RETURNING *`;
  const res = await query(q, params);
  return res.rows[0];
}
async function remove(table, idField, id) {
  await query(`DELETE FROM "${table}" WHERE "${idField}" = $1`, [id]);
  return true;
}

module.exports = { pool, query, one, insert, update, remove };
