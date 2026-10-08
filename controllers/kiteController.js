const logger = require('../utils/winstonLogger');

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

async function kiteLogin(req, res, next) {
  try {
    const apiKey = process.env.KITE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'KITE_API_KEY is not configured' });
    }

    const loginUrl = new URL('https://kite.zerodha.com/connect/login');
    loginUrl.searchParams.set('v', '3');
    loginUrl.searchParams.set('api_key', apiKey);

    return res.json({ loginUrl: loginUrl.toString() });
  } catch (err) {
    next(err);
  }
}

async function kiteCallback(req, res, next) {
  try {
    const { request_token: requestToken, status } = req.query;
    if (status !== 'success' || typeof requestToken !== 'string' || !requestToken) {
      logger.warn(`Kite login callback failed (status: ${status || 'missing'})`);
      return res.status(400).json({ message: 'Kite login did not return a request_token' });
    }

    if (process.env.NODE_ENV === 'production') {
      logger.info('Kite login callback received a request_token');
    } else {
      logger.info(`Kite request_token received: ${requestToken}`);
    }

    return res.json({ message: 'Kite login succeeded; request_token received' });
  } catch (err) {
    next(err);
  }
}

module.exports = { kiteLogin, kiteCallback };