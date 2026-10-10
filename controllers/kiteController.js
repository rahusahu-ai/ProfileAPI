const { KiteConnect } = require('kiteconnect');
const logger = require('../utils/winstonLogger');
const { getPool, query, sql } = require('../db');
require('dotenv').config();

function getKiteApiConfig() {
  const apiKey = process.env.KITE_API_KEY || process.env.KITE_CLIENT_ID || 'd65pes216aml7rs0';
  const apiSecret = process.env.KITE_API_SECRET || process.env.KITE_CLIENT_SECRET || '46jsn1mq4601cq1kas4dswo8zlw62eer';

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

    const loginUrl = new URL('https://kite.trade/connect/login');
    loginUrl.searchParams.set('v', '3');
    loginUrl.searchParams.set('api_key', apiKey);


    return res.json({ loginUrl: loginUrl.toString() });
  } catch (err) {
    next(err);
  }
}
async function kiteCallback1(req, res, next) {
  try {
    const { request_token: requestToken, status } = req.query;
    if (status !== 'success' || typeof requestToken !== 'string' || !requestToken) {
      logger.warn(`Kite login callback failed (status: ${status || 'missing'})`);
      return res.status(400).json({ message: 'Kite login did not return a request_token' });
    }

    return res.redirect('https://rajusahu.in/trade');

    
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
    let session;
    try {
      session = await kite.generateSession(requestToken, apiSecret);
    } catch (err) {
      logger.error('Kite session exchange failed', {
        errorName: err.name,
        errorType: err.error_type || err.data?.error_type,
        status: err.status || err.response?.status,
        message: err.message
      });
      return res.status(502).json({ message: 'Kite session exchange failed; check server logs for details' + (err.message ? `: ${err.message}` : '')  });
    }

    kite.setAccessToken(session.access_token);

    try {
      await saveKiteSession(session);
    } catch (err) {
      logger.error('Failed to save Kite session to database', getDatabaseErrorDetails(err));
      return res.status(500).json({
        message: 'Kite session was created, but saving it to the database failed',
        error: getDatabaseErrorDetails(err)
      });
    }

    logger.info('Kite session generated and saved successfully', { userId: session.user_id });
    return res.redirect('https://rajusahu.in/trade');
  } catch (err) {
    next(err);
  }
}

async function saveKiteSession(session) {
  if (!session.user_id || !session.access_token) {
    throw new Error('Kite returned an incomplete session');
  }

  const { access_token: accessToken, public_token: publicToken, ...sessionData } = session;
  const serializedSession = JSON.stringify(sessionData);

  try {
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      await pool.request()
        .input('kite_user_id', sql.NVarChar(64), session.user_id)
        .input('access_token', sql.NVarChar(sql.MAX), accessToken)
        .input('public_token', sql.NVarChar(sql.MAX), publicToken || null)
        .input('session_data', sql.NVarChar(sql.MAX), serializedSession)
        .query(`
          MERGE [kite_trade].[userProfile_sesssion] WITH (HOLDLOCK) AS target
          USING (SELECT @kite_user_id AS kite_user_id) AS source
          ON target.kite_user_id = source.kite_user_id
          WHEN MATCHED THEN UPDATE SET
            access_token = @access_token,
            public_token = @public_token,
            session_data = @session_data,
            updated_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT
            (kite_user_id, access_token, public_token, session_data)
            VALUES (@kite_user_id, @access_token, @public_token, @session_data);
        `);
      return;
    }

    await query(`
      INSERT INTO "kite_trade"."userProfile_sesssion"
        (kite_user_id, access_token, public_token, session_data)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (kite_user_id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        public_token = EXCLUDED.public_token,
        session_data = EXCLUDED.session_data,
        updated_at = NOW()
    `, [session.user_id, accessToken, publicToken || null, serializedSession]);
  } catch (err) {
    logger.error('Kite session database upsert failed', getDatabaseErrorDetails(err));
    throw err;
  }
}

function getDatabaseErrorDetails(err) {
  const driverError = err.originalError?.info || err;
  const details = {
    name: err.name,
    message: err.message,
    code: err.code || driverError.code || driverError.number,
    detail: err.detail || driverError.detail,
    schema: err.schema || driverError.schema,
    table: err.table || driverError.table,
    column: err.column || driverError.column,
    constraint: err.constraint || driverError.constraint,
    line: err.line || driverError.lineNumber,
    state: driverError.state,
    class: driverError.class
  };

  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}

async function getKiteProfile(req, res, next) {
  try {
    let accessToken;
    if (process.env.DB_DRIVER === 'sqlserver') {
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT TOP (1) access_token
        FROM [kite_trade].[userProfile_sesssion]
        ORDER BY updated_at DESC
      `);
      accessToken = result.recordset[0]?.access_token;
    } else {
      const result = await query(`
        SELECT access_token
        FROM "kite_trade"."userProfile_sesssion"
        ORDER BY updated_at DESC
        LIMIT 1
      `);
      accessToken = result.rows[0]?.access_token;
    }

    if (!accessToken) {
      return res.status(401).json({ message: 'No saved Kite session. Complete Kite login first.' });
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

module.exports = { kiteLogin, kiteCallback, getKiteProfile, getNiftyIndexPerMinute, saveKiteSession };