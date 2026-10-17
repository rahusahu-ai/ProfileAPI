const { KiteConnect } = require('kiteconnect');
const logger = require('../utils/winstonLogger');
const DBCommunicator = require('../utils/dbCommunicator');
require('dotenv').config();

const KITE_HISTORICAL_INTERVALS = ['minute', '3minute', '5minute', '10minute', '15minute', '30minute', '60minute', 'day'];

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

function getIntervalMinutes(interval) {
  if (interval === 'day') return 1440;
  return Number.parseInt(interval, 10) || 1;
}

function normalizeHistoricalCandles(candles) {
  return candles.map((candle, index) => {
    const candleTime = candle.date;
    const fields = ['open', 'high', 'low', 'close'];
    const values = fields.map((field) => Number(candle[field]));
    if (!(candleTime instanceof Date || typeof candleTime === 'string')
      || Number.isNaN(new Date(candleTime).getTime())
      || fields.some((field) => candle[field] === null || candle[field] === undefined)
      || values.some((value) => !Number.isFinite(value))) {
      throw new TypeError(`Invalid date or OHLC values in candle at index ${index}`);
    }

    const volume = candle.volume === null || candle.volume === undefined ? null : Number(candle.volume);
    const openInterest = candle.oi === null || candle.oi === undefined ? null : Number(candle.oi);
    if ((volume !== null && (!Number.isSafeInteger(volume) || volume < 0))
      || (openInterest !== null && (!Number.isSafeInteger(openInterest) || openInterest < 0))) {
      throw new TypeError(`Invalid volume or open interest in candle at index ${index}`);
    }

    return {
      candle_time: candleTime,
      open: values[0],
      high: values[1],
      low: values[2],
      close: values[3],
      volume,
      open_interest: openInterest
    };
  });
}

async function saveHistoricalCandles(instrumentToken, interval, exchange, tradingSymbol, instrumentName, candles) {
  if (!Number.isSafeInteger(instrumentToken) || instrumentToken <= 0) {
    throw new TypeError('instrument_token must be a positive integer');
  }
  if (typeof exchange !== 'string' || !exchange.trim()) {
    throw new TypeError('exchange must be a non-empty string');
  }
  if (typeof tradingSymbol !== 'string' || !tradingSymbol.trim()) {
    throw new TypeError('symbol must be a non-empty string');
  }
  if (!Array.isArray(candles)) {
    throw new TypeError('candles must be an array');
  }

  const intervalMinutes = getIntervalMinutes(interval);
  const normalizedCandles = normalizeHistoricalCandles(candles);
  return withDBCommunicator(async (db) => {
    if (db.useSQLServer) {
      const sql = require('mssql');
      const transaction = new sql.Transaction(db.connectionPool);
      await transaction.begin();
      try {
        const instrumentResult = await new sql.Request(transaction)
          .input('instrument_token', sql.BigInt, instrumentToken)
          .input('exchange', sql.NVarChar(100), exchange.trim())
          .input('trading_symbol', sql.NVarChar(200), tradingSymbol.trim())
          .input('name', sql.NVarChar(100), instrumentName || null)
          .query(`
            UPDATE [kite_trade].[instruments] WITH (UPDLOCK, SERIALIZABLE)
            SET trading_symbol = @trading_symbol,
                [name] = @name,
                exchange = @exchange,
                updated_at = SYSUTCDATETIME()
            WHERE instrument_token = @instrument_token;

            IF @@ROWCOUNT = 0
              INSERT INTO [kite_trade].[instruments]
                (instrument_token, trading_symbol, [name], exchange, segment, instrument_type,
                 strike, tick_size, lot_size)
              VALUES (@instrument_token, @trading_symbol, @name, @exchange, @exchange, 'EQ', 0, 0.05, 1);

            SELECT id FROM [kite_trade].[instruments]
            WHERE instrument_token = @instrument_token;
          `);
        const instrumentId = instrumentResult.recordset[0].id;

        for (const candle of normalizedCandles) {
          await new sql.Request(transaction)
            .input('instrument_id', sql.BigInt, instrumentId)
            .input('interval_minutes', sql.SmallInt, intervalMinutes)
            .input('candle_time', sql.DateTimeOffset, candle.candle_time)
            .input('open', sql.Decimal(12, 2), candle.open)
            .input('high', sql.Decimal(12, 2), candle.high)
            .input('low', sql.Decimal(12, 2), candle.low)
            .input('close', sql.Decimal(12, 2), candle.close)
            .input('volume', sql.BigInt, candle.volume)
            .input('open_interest', sql.BigInt, candle.open_interest)
            .query(`
              MERGE [kite_trade].[Nifty_market_candles] WITH (HOLDLOCK) AS target
              USING (SELECT @instrument_id AS instrument_id,
                            @interval_minutes AS interval_minutes,
                            @candle_time AS candle_time) AS source
              ON target.instrument_id = source.instrument_id
                AND target.interval_minutes = source.interval_minutes
                AND target.candle_time = source.candle_time
              WHEN MATCHED THEN UPDATE SET
                [open] = @open, [high] = @high, [low] = @low, [close] = @close,
                volume = @volume, open_interest = @open_interest
              WHEN NOT MATCHED THEN INSERT
                (instrument_id, interval_minutes, candle_time, [open], [high], [low], [close], volume, open_interest)
                VALUES (@instrument_id, @interval_minutes, @candle_time, @open, @high, @low, @close, @volume, @open_interest);
            `);
        }

        await transaction.commit();
        return { instrumentId, savedCandles: normalizedCandles.length };
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    }

    await db.client.query('BEGIN');
    try {
      const instrumentResult = await db.client.query(`
        INSERT INTO kite_trade.instruments
          (instrument_token, exchange_token, trading_symbol, name, exchange, segment, instrument_type,
           strike, tick_size, lot_size)
        VALUES ($1, NULL, $2, $3, $4, $4, 'EQ', 0, 0.05, 1)
        ON CONFLICT (instrument_token) DO UPDATE SET
          trading_symbol = EXCLUDED.trading_symbol,
          name = EXCLUDED.name,
          exchange = EXCLUDED.exchange,
          updated_at = NOW()
        RETURNING id
      `, [instrumentToken, tradingSymbol.trim(), instrumentName || null, exchange.trim()]);
      const instrumentId = instrumentResult.rows[0].id;

      if (normalizedCandles.length) {
        await db.client.query(`
          INSERT INTO kite_trade.nifty_market_candles
            (instrument_id, interval_minutes, candle_time, open, high, low, close, volume, open_interest)
          SELECT $1, $2, candle_time, open, high, low, close, volume, open_interest
          FROM jsonb_to_recordset($3::jsonb) AS candle(
            candle_time TIMESTAMPTZ,
            open NUMERIC(12, 2),
            high NUMERIC(12, 2),
            low NUMERIC(12, 2),
            close NUMERIC(12, 2),
            volume BIGINT,
            open_interest BIGINT
          )
          ON CONFLICT (instrument_id, interval_minutes, candle_time) DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume,
            open_interest = EXCLUDED.open_interest
        `, [instrumentId, intervalMinutes, JSON.stringify(normalizedCandles)]);
      }

      await db.client.query('COMMIT');
      return { instrumentId, savedCandles: normalizedCandles.length };
    } catch (err) {
      await db.client.query('ROLLBACK');
      throw err;
    }
  });
}

function mapKiteInstrumentToDatabase(instrument) {
  const exchangeTokenIsBlank = instrument.exchange_token === null
    || instrument.exchange_token === undefined
    || (typeof instrument.exchange_token === 'string' && instrument.exchange_token.trim() === '');

  return {
    instrument_token: instrument.instrument_token,
    exchange_token: exchangeTokenIsBlank ? null : instrument.exchange_token,
    trading_symbol: instrument.tradingsymbol,
    name: instrument.name,
    exchange: instrument.exchange,
    segment: instrument.segment,
    instrument_type: instrument.instrument_type,
    expiry: instrument.expiry === '' || instrument.expiry === null || instrument.expiry === undefined
      ? null
      : instrument.expiry instanceof Date
        ? instrument.expiry.toISOString().slice(0, 10)
        : String(instrument.expiry).slice(0, 10),
    strike: instrument.strike,
    tick_size: instrument.tick_size,
    lot_size: instrument.lot_size,
    last_price: instrument.last_price
  };
}

async function saveKiteInstruments(instruments) {
  const databaseInstruments = instruments
    .filter((instrument) => instrument.instrument_token !== null
      && instrument.instrument_token !== undefined
      && !(typeof instrument.instrument_token === 'string' && instrument.instrument_token.trim() === ''))
    .map(mapKiteInstrumentToDatabase);
  if (databaseInstruments.length === 0) return 0;

  return withDBCommunicator(async (db) => {
    if (db.useSQLServer) {
      const sql = require('mssql');
      const transaction = new sql.Transaction(db.connectionPool);
      await transaction.begin();
      try {
        const batchSize = 170;
        for (let start = 0; start < databaseInstruments.length; start += batchSize) {
          const batch = databaseInstruments.slice(start, start + batchSize);
          const parameters = [];
          const valueRows = batch.map((instrument, rowIndex) => {
            const values = [
              instrument.instrument_token,
              instrument.exchange_token,
              instrument.trading_symbol,
              instrument.name,
              instrument.exchange,
              instrument.segment,
              instrument.instrument_type,
              instrument.expiry,
              instrument.strike,
              instrument.tick_size,
              instrument.lot_size,
              instrument.last_price
            ];
            const types = [
              sql.BigInt, sql.BigInt, sql.NVarChar(100), sql.NVarChar(100),
              sql.NVarChar(20), sql.NVarChar(30), sql.NVarChar(10), sql.Date,
              sql.Decimal(18, 4), sql.Decimal(12, 4), sql.Int, sql.Decimal(18, 4)
            ];
            return `(${values.map((value, columnIndex) => {
              const parameter = `p${rowIndex}_${columnIndex}`;
              parameters.push({ parameter, type: types[columnIndex], value });
              return `@${parameter}`;
            }).join(', ')})`;
          });
          const request = new sql.Request(transaction);
          for (const { parameter, type, value } of parameters) {
            request.input(parameter, type, value);
          }
          await request.query(`
            MERGE [kite_trade].[instruments] WITH (HOLDLOCK) AS target
            USING (VALUES ${valueRows.join(', ')}) AS source
              (instrument_token, exchange_token, trading_symbol, [name], exchange, segment,
               instrument_type, expiry, strike, tick_size, lot_size, last_price)
            ON target.instrument_token = source.instrument_token
            WHEN MATCHED THEN UPDATE SET
              exchange_token = source.exchange_token,
              trading_symbol = source.trading_symbol,
              [name] = source.[name],
              exchange = source.exchange,
              segment = source.segment,
              instrument_type = source.instrument_type,
              expiry = source.expiry,
              strike = source.strike,
              tick_size = source.tick_size,
              lot_size = source.lot_size,
              last_price = source.last_price,
              updated_at = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN INSERT
              (instrument_token, exchange_token, trading_symbol, [name], exchange, segment,
               instrument_type, expiry, strike, tick_size, lot_size, last_price)
              VALUES
              (source.instrument_token, source.exchange_token, source.trading_symbol, source.[name],
               source.exchange, source.segment, source.instrument_type, source.expiry,
               source.strike, source.tick_size, source.lot_size, source.last_price);
          `);
        }
        await transaction.commit();
        return databaseInstruments.length;
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    }

    await db.client.query('BEGIN');
    try {
      await db.client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_kite_trade_instruments_token
        ON kite_trade.instruments (instrument_token)
      `);
      await db.client.query(`
        INSERT INTO kite_trade.instruments
          (instrument_token, exchange_token, trading_symbol, name, exchange, segment,
           instrument_type, expiry, strike, tick_size, lot_size, last_price)
        SELECT NULLIF(BTRIM(instrument_token), '')::BIGINT,
               NULLIF(BTRIM(exchange_token), '')::BIGINT,
               trading_symbol, name, exchange, segment, instrument_type, expiry,
               strike, tick_size, lot_size, last_price
        FROM jsonb_to_recordset($1::jsonb) AS instrument(
          instrument_token TEXT,
          exchange_token TEXT,
          trading_symbol VARCHAR(100),
          name VARCHAR(100),
          exchange VARCHAR(20),
          segment VARCHAR(30),
          instrument_type VARCHAR(10),
          expiry DATE,
          strike NUMERIC(18, 4),
          tick_size NUMERIC(12, 4),
          lot_size INTEGER,
          last_price NUMERIC(18, 4)
        )
        WHERE NULLIF(BTRIM(instrument_token), '') IS NOT NULL
        ON CONFLICT (instrument_token) DO UPDATE SET
          exchange_token = EXCLUDED.exchange_token,
          trading_symbol = EXCLUDED.trading_symbol,
          name = EXCLUDED.name,
          exchange = EXCLUDED.exchange,
          segment = EXCLUDED.segment,
          instrument_type = EXCLUDED.instrument_type,
          expiry = EXCLUDED.expiry,
          strike = EXCLUDED.strike,
          tick_size = EXCLUDED.tick_size,
          lot_size = EXCLUDED.lot_size,
          last_price = EXCLUDED.last_price,
          updated_at = NOW()
      `, [JSON.stringify(databaseInstruments)]);
      await db.client.query('COMMIT');
      return databaseInstruments.length;
    } catch (err) {
      await db.client.query('ROLLBACK');
      throw err;
    }
  });
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
    let savedInstruments;
    try {
      savedInstruments = await saveKiteInstruments(instruments);
    } catch (err) {
      const error = getDatabaseErrorDetails(err);
      logger.error('Failed to save Kite instruments', error);
      return res.status(500).json({ message: 'Kite instruments were fetched but could not be saved', error });
    }

    res.set('X-Instruments-Saved', String(savedInstruments));
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

async function getAllExchangeList(req, res, next) {
  try {
    const exchanges = await withDBCommunicator(async (db) => {
      if (db.useSQLServer) {
        const result = await db.connectionPool.request().query(`
          SELECT DISTINCT exchange
          FROM [kite_trade].[instruments]
          ORDER BY exchange
        `);
        return result.recordset.map(({ exchange }) => exchange);
      }

      const result = await db.client.query(`
        SELECT DISTINCT exchange
        FROM kite_trade.instruments
        ORDER BY exchange
      `);
      return result.rows.map(({ exchange }) => exchange);
    });

    return res.json(exchanges);
  } catch (err) {
    next(err);
  }
}

async function getSegmentList(req, res, next) {
  try {
    const exchange = typeof req.query.exchange === 'string' ? req.query.exchange.trim() : '';
    if (!exchange) {
      return res.status(400).json({ message: 'exchange query parameter is required' });
    }

    const segments = await withDBCommunicator(async (db) => {
      if (db.useSQLServer) {
        const sql = require('mssql');
        const result = await db.connectionPool.request()
          .input('exchange', sql.NVarChar(20), exchange)
          .query(`
            SELECT DISTINCT segment
            FROM [kite_trade].[instruments]
            WHERE exchange = @exchange
            ORDER BY segment
          `);
        return result.recordset.map(({ segment }) => segment);
      }

      const result = await db.client.query(`
        SELECT DISTINCT segment
        FROM kite_trade.instruments
        WHERE exchange = $1
        ORDER BY segment
      `, [exchange]);
      return result.rows.map(({ segment }) => segment);
    });

    return res.json(segments);
  } catch (err) {
    next(err);
  }
}

async function getAllEntityList(req, res, next) {
  try {
    const exchange = typeof req.query.exchange === 'string' ? req.query.exchange.trim() : '';
    const segment = typeof req.query.segment === 'string' ? req.query.segment.trim() : '';
    if (!exchange || !segment) {
      return res.status(400).json({ message: 'exchange and segment query parameters are required' });
    }

    const entities = await withDBCommunicator(async (db) => {
      if (db.useSQLServer) {
        const sql = require('mssql');
        const result = await db.connectionPool.request()
          .input('exchange', sql.NVarChar(20), exchange)
          .input('segment', sql.NVarChar(30), segment)
          .query(`
            SELECT instrument_token, exchange_token, trading_symbol, [name], exchange,
                   segment, instrument_type, expiry, strike, tick_size, lot_size, last_price,
                   updated_at
            FROM [kite_trade].[instruments]
            WHERE exchange = @exchange AND segment = @segment
            ORDER BY trading_symbol
          `);
        return result.recordset;
      }

      const result = await db.client.query(`
        SELECT instrument_token, exchange_token, trading_symbol, name, exchange,
               segment, instrument_type, expiry, strike, tick_size, lot_size, last_price,
               updated_at
        FROM kite_trade.instruments
        WHERE exchange = $1 AND segment = $2
        ORDER BY trading_symbol
      `, [exchange, segment]);
      return result.rows;
    });

    return res.json(entities);
  } catch (err) {
    next(err);
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

async function getNiftyIndexPerMinute_fixed(req, res, next) {
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
    if (!KITE_HISTORICAL_INTERVALS.includes(interval)) {
      return res.status(400).json({ message: 'Unsupported interval', validIntervals: KITE_HISTORICAL_INTERVALS });
    }

    const to = new Date();
    const from = new Date(to.getTime() - 60 * 60 * 1000);
    const fromDate = parseKiteDate(options.from_date ?? options.from, from);
    const toDate = parseKiteDate(options.to_date ?? options.to, to);
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

async function getIndexDataForGivenTimeInterval(req, res, next) {
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
    if (!KITE_HISTORICAL_INTERVALS.includes(interval)) {
      return res.status(400).json({ message: 'Unsupported interval', validIntervals: KITE_HISTORICAL_INTERVALS });
    }

    const to = new Date();
    const from = new Date(to.getTime() - 60 * 60 * 1000);
    const fromDate = parseKiteDate(options.from_date ?? options.from, from);
    const toDate = parseKiteDate(options.to_date ?? options.to, to);
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

    const saveToDb = parseBooleanOption(options.saveToDb);
    let saveResult = null;
    if (saveToDb) {
      const exchange = options.exchange;
      const tradingSymbol = options.symbol || options.tradingsymbol;
      if (typeof exchange !== 'string' || !exchange.trim()
        || typeof tradingSymbol !== 'string' || !tradingSymbol.trim()) {
        return res.status(400).json({ message: 'exchange and symbol are required when saveToDb is true' });
      }

      try {
        saveResult = await saveHistoricalCandles(
          instrumentToken,
          interval,
          exchange,
          tradingSymbol,
          options.instrument_name || tradingSymbol,
          candles
        );
      } catch (err) {
        if (err instanceof TypeError) {
          return res.status(400).json({ message: err.message });
        }
        const error = getDatabaseErrorDetails(err);
        logger.error('Failed to save Kite historical candles', error);
        return res.status(500).json({
          message: 'Historical candles were fetched but could not be saved',
          error
        });
      }
    }

    const candlesForResponse = candles.map((candle) => ({
      ...candle,
      date: formatCandleTime(candle.date)
    }));

    return res.json({
      instrument_token: instrumentToken,
      interval,
      from: fromDate,
      to: toDate,
      saved: saveToDb,
      ...(saveResult ? {
        instrument_id: saveResult.instrumentId,
        saved_candles: saveResult.savedCandles
      } : {}),
      candles: candlesForResponse
    });
  } catch (err) {
    next(err);
  }
}

async function saveNiftyIndexCandles(req, res, next) {
  try {
    const options = { ...req.query, ...(req.body || {}) };
    const instrumentToken = Number(options.instrument_token);
    if (!Number.isSafeInteger(instrumentToken) || instrumentToken <= 0) {
      return res.status(400).json({ message: 'instrument_token must be a positive integer' });
    }

    const interval = options.interval;
    if (!KITE_HISTORICAL_INTERVALS.includes(interval)) {
      return res.status(400).json({ message: 'Unsupported interval', validIntervals: KITE_HISTORICAL_INTERVALS });
    }

    const exchange = options.exchange;
    const tradingSymbol = options.symbol || options.tradingsymbol;
    if (typeof exchange !== 'string' || !exchange.trim()
      || typeof tradingSymbol !== 'string' || !tradingSymbol.trim()) {
      return res.status(400).json({ message: 'exchange and symbol are required to save historical candles' });
    }
    if (!Array.isArray(options.candles)) {
      return res.status(400).json({ message: 'candles must be an array' });
    }

    const saveResult = await saveHistoricalCandles(
      instrumentToken,
      interval,
      exchange,
      tradingSymbol,
      options.instrument_name || tradingSymbol,
      options.candles
    );

    return res.json({
      instrument_token: instrumentToken,
      interval,
      exchange,
      symbol: tradingSymbol,
      saved: true,
      instrument_id: saveResult.instrumentId,
      saved_candles: saveResult.savedCandles,
      candles: options.candles
    });
  } catch (err) {
    if (err instanceof TypeError) {
      return res.status(400).json({ message: err.message });
    }
    const error = getDatabaseErrorDetails(err);
    logger.error('Failed to save submitted Kite historical candles', error);
    return res.status(500).json({
      message: 'Historical candles could not be saved',
      error
    });
  }
}


function formatCandleTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).map(({ type, value: partValue }) => [type, partValue]));

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:30`;
}

module.exports = {
  kiteLogin,
  kiteCallback,
  getKiteSession,
  getKiteProfile,
  getAllInstruments,
  getInstrumentsByExchange,
  getAllExchangeList,
  getSegmentList,
  getAllEntityList,
  getIndexDataForGivenTimeInterval,
  saveNiftyIndexCandles,
  saveKiteSession
};