const { KiteConnect } = require('kiteconnect');
const logger = require('../utils/winstonLogger');

function getKiteApiConfig() {
  const apiKey = process.env.KITE_API_KEY || process.env.KITE_CLIENT_ID || 'd65pes216aml7rs0';
  const apiSecret = process.env.KITE_API_SECRET || process.env.KITE_CLIENT_SECRET || '0g1q6j7v8x9y2z3a4b5c6d7e8f9g0h1i';

  if (!apiKey) {
    throw new Error('KITE_API_KEY is not configured');
  }

  if (!apiSecret) {
    throw new Error('KITE_API_SECRET is not configured');
  }

  return { apiKey, apiSecret };
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

async function kiteLogin(req, res, next) {
  try {
    const { apiKey } = getKiteApiConfig();
    const redirectUri = process.env.KITE_REDIRECT_URI || process.env.KITE_CALLBACK_URL;

    const loginUrl = new URL('https://kite.trade/connect/login');
    loginUrl.searchParams.set('v', '3');
    loginUrl.searchParams.set('api_key', apiKey);

    if (redirectUri) {
      loginUrl.searchParams.set('redirect_uri', redirectUri);
    }

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

    const { apiKey, apiSecret } = getKiteApiConfig();

    const kite = new KiteConnect({ api_key: apiKey });
    const session = await kite.generateSession(requestToken, apiSecret);
    kite.setAccessToken(session.access_token);

    if (process.env.NODE_ENV === 'production') {
      logger.info('Kite login callback received a valid session');
    } else {
      logger.info(`Kite session generated for request_token: ${requestToken}`);
    }

    return res.redirect('https://rajusahu.in/trade');
  } catch (err) {
    next(err);
  }
}

async function getKiteProfile(req, res, next) {
  try {
    const accessToken = req.query.access_token || req.body.access_token || req.headers['x-kite-access-token'];

    if (!accessToken) {
      return res.status(400).json({ message: 'access_token is required' });
    }

    const { apiKey } = getKiteApiConfig();

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const profile = await kite.getProfile();
    return res.json(profile);
  } catch (err) {
    next(err);
  }
}

async function getNiftyIndexPerMinute(req, res, next) {
  try {
    const accessToken = req.query.access_token || req.body.access_token || req.headers['x-kite-access-token'];

    if (!accessToken) {
      return res.status(400).json({ message: 'access_token is required' });
    }

    const { apiKey } = getKiteApiConfig();

    const instrumentToken = Number(req.query.instrument_token || 256265);
    const to = new Date();
    const from = new Date(to.getTime() - 60 * 60 * 1000);

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const candles = await kite.getHistoricalData(instrumentToken, 'minute', from.toISOString(), to.toISOString(), false, false);

    return res.json({
      instrument_token: instrumentToken,
      interval: 'minute',
      from: from.toISOString(),
      to: to.toISOString(),
      candles
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { kiteLogin, kiteCallback, getKiteProfile, getNiftyIndexPerMinute };