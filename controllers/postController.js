// controllers/postsController.js
const { getPool, query, sql, one, insert, update: updateDb, remove: removeDb } = require('../db');

async function getAll(req, res, next) {
  try {
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      const result = await pool.request().query('SELECT * FROM posts ORDER BY date_time DESC');
      return res.json(result.recordset);
    } else {
      const result = await query('SELECT * FROM posts ORDER BY date_time DESC');
      return res.json(result.rows);
    }
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      const result = await pool.request().input('id', sql.Int, id).query('SELECT * FROM posts WHERE id = @id');
      if (!result.recordset.length) return res.status(404).json({ message: 'Not found' });
      return res.json(result.recordset[0]);
    } else {
      const row = await one('SELECT * FROM posts WHERE id = $1', [id]);
      if (!row) return res.status(404).json({ message: 'Not found' });
      return res.json(row);
    }
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { p_name, title, link, date_time, sub_title } = req.body;
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      const result = await pool.request()
        .input('p_name', sql.NVarChar(200), p_name)
        .input('title', sql.NVarChar(500), title)
        .input('link', sql.NVarChar(1000), link)
        .input('date_time', sql.DateTime2, date_time)
        .input('sub_title', sql.NVarChar(500), sub_title)
        .query(`INSERT INTO posts (p_name, title, link, date_time, sub_title) OUTPUT INSERTED.* VALUES (@p_name,@title,@link,@date_time,@sub_title);`);
      return res.status(201).json(result.recordset[0]);
    } else {
      const created = await insert('posts', { p_name, title, link, date_time, sub_title });
      return res.status(201).json(created);
    }
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const { p_name, title, link, date_time, sub_title } = req.body;
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.Int, id)
        .input('p_name', sql.NVarChar(200), p_name)
        .input('title', sql.NVarChar(500), title)
        .input('link', sql.NVarChar(1000), link)
        .input('date_time', sql.DateTime2, date_time)
        .input('sub_title', sql.NVarChar(500), sub_title)
        .query(`UPDATE posts SET p_name=@p_name, title=@title, link=@link, date_time=@date_time, sub_title=@sub_title OUTPUT INSERTED.* WHERE id=@id;`);
      if (!result.recordset.length) return res.status(404).json({ message: 'Not found' });
      return res.json(result.recordset[0]);
    } else {
      const updated = await updateDb('posts', 'id', id, { p_name, title, link, date_time, sub_title });
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
      await pool.request().input('id', sql.Int, id).query('DELETE FROM posts WHERE id=@id');
      return res.status(204).send();
    } else {
      await removeDb('posts', 'id', id);
      return res.status(204).send();
    }
  } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, update, remove };
