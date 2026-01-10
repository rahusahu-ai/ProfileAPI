// controllers/authController.js
const jwt = require('../jwt');
const bcrypt = require('bcrypt');
const DBCommunicator = require('../utils/dbCommunicator');
const logger = require('../utils/winstonLogger');
const sql = require('mssql');

// POST /api/auth/login
exports.login = async (req, res, next) => {
  const dbCommunicator = new DBCommunicator();
  
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'username & password required' });
    }

    await dbCommunicator.initialise();
    const client = dbCommunicator.client;
    const pool = dbCommunicator.connectionPool;

    let user;

    if (dbCommunicator.useSQLServer) {
      // SQL Server path
      const result = await pool.request()
        .input('username', sql.NVarChar(100), username)
        .query('SELECT id, username, password_hash FROM users WHERE username = @username');
      user = result.recordset[0];
    } else {
      // PostgreSQL path
      const result = await client.query(
        'SELECT id, username, password_hash FROM users WHERE username = $1',
        [username]
      );
      user = result.rows[0];
    }

    if (!user) {
      await dbCommunicator.closeConnection();
      return res.status(401).json({ message: 'invalid credentials' });
    }

    // Compare password with hash
    const passwordField = dbCommunicator.useSQLServer ? 'password_hash' : 'password_hash';
    const valid = await bcrypt.compare(password, user[passwordField]);

    if (!valid) {
      await dbCommunicator.closeConnection();
      return res.status(401).json({ message: 'invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ sub: user.id, username: user.username });

    await dbCommunicator.closeConnection();
    res.json({ token });

  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    next(err);
  }
};

exports.getAddress = async (req, res, next) => {
  logger.info('Get Address Invoked');
  try {
    res.json({ address: '123 Main St, Anytown, USA' });
  } catch (err) {
    next(err);
  }
};
