// controllers/subscribersController.js
const DBCommunicator = require('../utils/dbCommunicator');
const logger = require('../utils/winstonLogger');
const sql = require('mssql');

// GET /api/subscribers
async function getAll(req, res, next) {
  const dbCommunicator = new DBCommunicator();
  try {
    await dbCommunicator.initialise();
    const client = dbCommunicator.client;
    const pool = dbCommunicator.connectionPool;

    let result;

    if (dbCommunicator.useSQLServer) {
      result = await pool.request().query('SELECT * FROM users ORDER BY datetime DESC');
      await dbCommunicator.closeConnection();
      return res.json(result.recordset);
    } else {
      result = await client.query('SELECT * FROM users ORDER BY datetime DESC');
      await dbCommunicator.closeConnection();
      return res.json(result.rows);
    }
  } catch (err) { 
    logger.error(`getAll error: ${err.message}`);
    next(err); 
  }
}

async function getById(req, res, next) {
  const dbCommunicator = new DBCommunicator();
  try {
    const id = parseInt(req.params.id, 10);
    await dbCommunicator.initialise();
    const client = dbCommunicator.client;
    const pool = dbCommunicator.connectionPool;

    let result;

    if (dbCommunicator.useSQLServer) {
      result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM users WHERE id = @id');
      await dbCommunicator.closeConnection();
      if (!result.recordset.length) return res.status(404).json({ message: 'Not found' });
      return res.json(result.recordset[0]);
    } else {
      result = await client.query('SELECT * FROM users WHERE id = $1', [id]);
      await dbCommunicator.closeConnection();
      if (!result.rows.length) return res.status(404).json({ message: 'Not found' });
      return res.json(result.rows[0]);
    }
  } catch (err) { 
    logger.error(`getById error: ${err.message}`);
    next(err); 
  }
}

async function create(req, res, next) {
  const dbCommunicator = new DBCommunicator();
  try {
    const { name, email, datetime } = req.body;
    await dbCommunicator.initialise();
    const client = dbCommunicator.client;
    const pool = dbCommunicator.connectionPool;

    let result;

    if (dbCommunicator.useSQLServer) {
      result = await pool.request()
        .input('name', sql.NVarChar(200), name)
        .input('email', sql.NVarChar(200), email)
        .input('datetime', sql.DateTime2, datetime)
        .query('INSERT INTO users (name, email, datetime) OUTPUT INSERTED.* VALUES (@name, @email, @datetime);');
      await dbCommunicator.closeConnection();
      return res.status(201).json(result.recordset[0]);
    } else {
      result = await client.query(
        'INSERT INTO users (name, email, datetime) VALUES ($1, $2, $3) RETURNING *',
        [name, email, datetime]
      );
      await dbCommunicator.closeConnection();
      return res.status(201).json(result.rows[0]);
    }
  } catch (err) { 
    logger.error(`create error: ${err.message}`);
    next(err); 
  }
}

async function update(req, res, next) {
  const dbCommunicator = new DBCommunicator();
  try {
    const id = parseInt(req.params.id, 10);
    const { name, email, datetime } = req.body;
    await dbCommunicator.initialise();
    const client = dbCommunicator.client;
    const pool = dbCommunicator.connectionPool;

    let result;

    if (dbCommunicator.useSQLServer) {
      result = await pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar(200), name)
        .input('email', sql.NVarChar(200), email)
        .input('datetime', sql.DateTime2, datetime)
        .query('UPDATE users SET name=@name, email=@email, datetime=@datetime OUTPUT INSERTED.* WHERE id=@id;');
      await dbCommunicator.closeConnection();
      if (!result.recordset.length) return res.status(404).json({ message: 'Not found' });
      return res.json(result.recordset[0]);
    } else {
      result = await client.query(
        'UPDATE users SET name=$1, email=$2, datetime=$3 WHERE id=$4 RETURNING *',
        [name, email, datetime, id]
      );
      await dbCommunicator.closeConnection();
      if (!result.rows.length) return res.status(404).json({ message: 'Not found' });
      return res.json(result.rows[0]);
    }
  } catch (err) { 
    logger.error(`update error: ${err.message}`);
    next(err); 
  }
}

async function remove(req, res, next) {
  const dbCommunicator = new DBCommunicator();
  try {
    const id = parseInt(req.params.id, 10);
    await dbCommunicator.initialise();
    const client = dbCommunicator.client;
    const pool = dbCommunicator.connectionPool;

    if (dbCommunicator.useSQLServer) {
      await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM users WHERE id=@id');
      await dbCommunicator.closeConnection();
      return res.status(204).send();
    } else {
      await client.query('DELETE FROM users WHERE id=$1', [id]);
      await dbCommunicator.closeConnection();
      return res.status(204).send();
    }
  } catch (err) { 
    logger.error(`remove error: ${err.message}`);
    next(err); 
  }
}

async function noofsubscriber(req, res, next) {
  const dbCommunicator = new DBCommunicator();
  try {
    await dbCommunicator.initialise();
    const client = dbCommunicator.client;
    const pool = dbCommunicator.connectionPool;

    let result;

    if (dbCommunicator.useSQLServer) {
      result = await pool.request().query('SELECT COUNT(*) as totalSubscribers FROM users');
      await dbCommunicator.closeConnection();
      return res.json({ 
        totalSubscribers: result.recordset[0].totalSubscribers 
      });
    } else {
      result = await client.query('SELECT COUNT(*) as "totalSubscribers" FROM users');
      await dbCommunicator.closeConnection();
      return res.json({ 
        totalSubscribers: parseInt(result.rows[0].totalSubscribers) 
      });
    }
  } catch (err) { 
    logger.error(`noofsubscriber error: ${err.message}`);
    next(err); 
  }
}

module.exports = { getAll, getById, create, update, remove, noofsubscriber };
