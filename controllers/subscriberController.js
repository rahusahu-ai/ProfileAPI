// controllers/subscribersController.js
const { getPool, query, sql, one, insert, update: updateDb, remove: removeDb } = require('../db');


// GET /api/subscribers
async function getAll(req, res, next) {
  try {
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      const result = await pool.request().query('SELECT * FROM subscribers ORDER BY datetime DESC');
      return res.json(result.recordset);
    } else {
      const result = await query('SELECT * FROM subscribers ORDER BY datetime DESC');
      return res.json(result.rows);
    }
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      const result = await pool.request().input('id', sql.Int, id).query('SELECT * FROM subscribers WHERE id = @id');
      if (!result.recordset.length) return res.status(404).json({ message: 'Not found' });
      return res.json(result.recordset[0]);
    } else {
      const row = await one('SELECT * FROM subscribers WHERE id = $1', [id]);
      if (!row) return res.status(404).json({ message: 'Not found' });
      return res.json(row);
    }
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, email, datetime } = req.body;
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      const result = await pool.request()
        .input('name', sql.NVarChar(200), name)
        .input('email', sql.NVarChar(200), email)
        .input('datetime', sql.DateTime2, datetime)
        .query(`INSERT INTO subscribers (name, email, datetime) OUTPUT INSERTED.* VALUES (@name,@email,@datetime);`);
      return res.status(201).json(result.recordset[0]);
    } else {
      const created = await insert('subscribers', { name, email, datetime });
      return res.status(201).json(created);
    }
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, email, datetime } = req.body;
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar(200), name)
        .input('email', sql.NVarChar(200), email)
        .input('datetime', sql.DateTime2, datetime)
        .query(`UPDATE subscribers SET name=@name, email=@email, datetime=@datetime OUTPUT INSERTED.* WHERE id=@id;`);
      if (!result.recordset.length) return res.status(404).json({ message: 'Not found' });
      return res.json(result.recordset[0]);
    } else {
      const updated = await update('subscribers', 'id', id, { name, email, datetime });
      if (!updated) return res.status(404).json({ message: 'Not found' });
      return res.json(updated);
    }
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      await pool.request().input('id', sql.Int, id).query('DELETE FROM subscribers WHERE id=@id');
      return res.status(204).send();
    } else {
      await remove('subscribers', 'id', id);
      return res.status(204).send();
    }
  } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, update, remove };
