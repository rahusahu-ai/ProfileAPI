// controllers/authController.js
const dbDriver = require('../db');
const jwt = require('../jwt');
const bcrypt = require('bcrypt');


// POST /api/auth/login

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'username & password required' });

    // Try Postgres-flavored query first (dbDriver.one) else fallback depending on driver
    if (process.env.DB_DRIVER === 'sqlserver') {
      // SQL Server path
      const pool = await dbDriver.getPool();
      const result = await pool.request().input('username', dbDriver.sql.NVarChar(100), username)
        .query('SELECT id, username, passwordHash FROM users WHERE username = @username');
      const user = result.recordset[0];
      if (!user) return res.status(401).json({ message: 'invalid credentials' });
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: 'invalid credentials' });
      const token = jwt.sign({ sub: user.id, username: user.username });
      res.json({ token });
    } else {
      // Postgres path (and unified)
      const row = await dbDriver.one('SELECT id, username, passwordhash FROM users WHERE username = $1', [username]);
      const user = row;
      if (!user) return res.status(401).json({ message: 'invalid credentials' });
      const valid = await bcrypt.compare(password, user.passwordhash);
      if (!valid) return res.status(401).json({ message: 'invalid credentials' });
      const token = jwt.sign({ sub: user.id, username: user.username });
      res.json({ token });
    }
  } catch (err) { next(err); }
};

exports.getAddress = async (req, res, next) => {
  logger.info('Get Address Invoked');
  try {
    res.json({ address: '123 Main St, Anytown, USA' });
  } catch (err) { next(err); }
}
