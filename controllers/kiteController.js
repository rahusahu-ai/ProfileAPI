const { KiteConnect } = require('kiteconnect');
const logger = require('../utils/winstonLogger');
const DBCommunicator = require('../utils/dbCommunicator');
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
    await withDBCommunicator(async (db) => {
      if (db.useSQLServer) {
        const sql = require('mssql');
        await db.connectionPool.request()
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

      await db.client.query(`
        INSERT INTO kite_trade.userProfile_sesssion
          (kite_user_id, access_token, public_token, session_data)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (kite_user_id) DO UPDATE SET
          access_token = EXCLUDED.access_token,
          public_token = EXCLUDED.public_token,
          session_data = EXCLUDED.session_data,
          updated_at = NOW()
      `, [session.user_id, accessToken, publicToken || null, serializedSession]);
    });
  } catch (err) {
    logger.error('Kite session database upsert failed', getDatabaseErrorDetails(err));
    throw err;
  }
}

async function withDBCommunicator(operation) {
  const db = new DBCommunicator();
  await db.initialise();

  if (db.useSQLServer && !db.connectionPool) {
    throw new Error('SQL Server connection initialization failed');
  }
  if (!db.useSQLServer && !db.client) {
    throw new Error('PostgreSQL connection initialization failed');
  }

  try {
    return await operation(db);
  } finally {
    await db.closeConnection();
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

async function getKiteSession() {
  let accessToken;

  await withDBCommunicator(async (db) => {
    if (db.useSQLServer) {
      const result = await db.connectionPool.request().query(`
        SELECT TOP (1) access_token
        FROM [kite_trade].[userProfile_sesssion]
        ORDER BY updated_at DESC
      `);
      accessToken = result.recordset[0]?.access_token;
      return;
    }

    const result = await db.client.query(`
      SELECT access_token
      FROM kite_trade.userProfile_sesssion
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    accessToken = result.rows[0]?.access_token;
  });

  return accessToken ? { accessToken } : null;
}

async function getKiteProfile(req, res, next) {
  try {
    const session = await getKiteSession();
    if (!session) {
      return res.status(401).json({ message: 'No saved Kite session. Complete Kite login first.' });
    }

    const { apiKey } = getKiteApiConfig();

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(session.accessToken);

    const profile = await kite.getProfile();
    return res.json(profile);
  } catch (err) {
    next(err);
  }
}

async function getAllInstruments(req, res, next) {
  try {
    const kite = await getAuthenticatedKiteClient();
    if (!kite) {
      return res.status(401).json({ message: 'No saved Kite session. Complete Kite login first.' });
    }

    const instruments = await kite.getInstruments();
    return res.json(instruments);
  } catch (err) {
    return respondWithKiteError(res, 'Failed to fetch all instruments', err);
  }
}

async function getInstrumentsByExchange(req, res, next) {
  try {
    const exchange = String(req.params.exchange || '').toUpperCase();
    const supportedExchanges = ['NSE', 'BSE', 'NFO', 'BFO', 'CDS', 'MCX'];
    if (!supportedExchanges.includes(exchange)) {
      return res.status(400).json({
        message: 'Unsupported exchange',
        supportedExchanges
      });
    }

    const kite = await getAuthenticatedKiteClient();
    if (!kite) {
      return res.status(401).json({ message: 'No saved Kite session. Complete Kite login first.' });
    }

    const instruments = await kite.getInstruments(exchange);
    return res.json(instruments);
  } catch (err) {
    return respondWithKiteError(res, 'Failed to fetch instruments for exchange', err);
  }
}

async function getAuthenticatedKiteClient() {
  const session = await getKiteSession();
  if (!session) return null;

  const { apiKey } = getKiteApiConfig();
  const kite = new KiteConnect({ api_key: apiKey });
  kite.setAccessToken(session.accessToken);
  return kite;
}

function respondWithKiteError(res, message, err) {
  const error = {
    type: err.error_type || err.data?.error_type || err.name,
    status: err.status || err.response?.status,
    message: err.message
  };
  logger.error(message, error);
  return res.status(502).json({ message, error });
}

async function getNiftyIndexPerMinute(req, res, next) {
  try {
    const session = await getKiteSession();
    if (!session) {
      return res.status(401).json({ message: 'No saved Kite session. Complete Kite login first.' });
    }

    const { apiKey } = getKiteApiConfig();

    const options = { ...req.query, ...(req.body || {}) };
    const instrumentToken = Number(options.instrument_token || 256265);
    if (!Number.isSafeInteger(instrumentToken) || instrumentToken <= 0) {
      return res.status(400).json({ message: 'instrument_token must be a positive integer' });
    }

    const interval = options.interval || 'minute';
    const validIntervals = ['minute', '3minute', '5minute', '10minute', '15minute', '30minute', '60minute', 'day'];
    if (!validIntervals.includes(interval)) {
      return res.status(400).json({ message: 'Unsupported interval', validIntervals });
    }

    const to = new Date();
    const from = new Date(to.getTime() - 60 * 60 * 1000);
    const fromDate = parseKiteDate(options.from, from);
    const toDate = parseKiteDate(options.to, to);
    if (!fromDate || !toDate || new Date(fromDate) >= new Date(toDate)) {
      return res.status(400).json({ message: 'from and to must be valid dates, with from earlier than to' });
    }

    const continuous = parseBooleanOption(options.continuous);
    const oi = parseBooleanOption(options.oi);

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(session.accessToken);

    let candles;
    try {
      candles = await kite.getHistoricalData(instrumentToken, interval, fromDate, toDate, continuous, oi);
    } catch (err) {
      const error = {
        name: err.name,
        type: err.error_type || err.data?.error_type,
        status: err.status || err.response?.status,
        message: err.message
      };
      logger.error('Kite historical data request failed', error);
      return res.status(502).json({ message: 'Kite historical data request failed', error });
    }

    return res.json({
      instrument_token: instrumentToken,
      interval,
      from: fromDate,
      to: toDate,
      candles
    });
  } catch (err) {
    next(err);
  }
}

function parseKiteDate(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return formatKiteDate(fallback);
  }

  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return value;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatKiteDate(date);
}

function parseBooleanOption(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function formatKiteDate(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).map(({ type, value }) => [type, value]));

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

module.exports = {
  kiteLogin,
  kiteCallback,
  getKiteSession,
  getKiteProfile,
  getAllInstruments,
  getInstrumentsByExchange,
  getNiftyIndexPerMinute,
  saveKiteSession
};