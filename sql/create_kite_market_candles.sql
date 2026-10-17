-- PostgreSQL schema for Kite instruments and normalized market candles.
CREATE SCHEMA IF NOT EXISTS kite_trade;

CREATE TABLE IF NOT EXISTS kite_trade.instruments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instrument_token BIGINT NOT NULL,
  exchange_token BIGINT,
  trading_symbol VARCHAR(100) NOT NULL,
  name VARCHAR(100),
  exchange VARCHAR(20) NOT NULL,
  segment VARCHAR(30) NOT NULL,
  instrument_type VARCHAR(10) NOT NULL,
  expiry DATE,
  strike NUMERIC(18, 4) NOT NULL DEFAULT 0,
  tick_size NUMERIC(12, 4) NOT NULL,
  lot_size INTEGER NOT NULL,
  last_price NUMERIC(18, 4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_instrument_type CHECK (instrument_type IN ('EQ', 'FUT', 'CE', 'PE')),
  CONSTRAINT chk_tick_size CHECK (tick_size > 0),
  CONSTRAINT chk_lot_size CHECK (lot_size > 0)
);

ALTER TABLE kite_trade.instruments
  ADD COLUMN IF NOT EXISTS exchange_token BIGINT,
  ADD COLUMN IF NOT EXISTS name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS segment VARCHAR(30),
  ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(10),
  ADD COLUMN IF NOT EXISTS expiry DATE,
  ADD COLUMN IF NOT EXISTS strike NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS tick_size NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS lot_size INTEGER,
  ADD COLUMN IF NOT EXISTS last_price NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'kite_trade' AND table_name = 'instruments'
      AND column_name = 'instrument_name'
  ) THEN
    EXECUTE 'UPDATE kite_trade.instruments SET name = COALESCE(name, instrument_name)';
  END IF;
END;
$$;

UPDATE kite_trade.instruments
SET segment = COALESCE(segment, exchange),
    instrument_type = COALESCE(instrument_type, 'EQ'),
    strike = COALESCE(strike, 0),
    tick_size = COALESCE(tick_size, 0.05),
    lot_size = COALESCE(lot_size, 1),
    updated_at = COALESCE(updated_at, NOW());

ALTER TABLE kite_trade.instruments
  ALTER COLUMN segment SET NOT NULL,
  ALTER COLUMN instrument_type SET NOT NULL,
  ALTER COLUMN strike SET DEFAULT 0,
  ALTER COLUMN strike SET NOT NULL,
  ALTER COLUMN tick_size SET NOT NULL,
  ALTER COLUMN lot_size SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kite_trade_instruments_token
  ON kite_trade.instruments (instrument_token);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_instrument_type'
      AND conrelid = 'kite_trade.instruments'::regclass
  ) THEN
    ALTER TABLE kite_trade.instruments ADD CONSTRAINT chk_instrument_type
      CHECK (instrument_type IN ('EQ', 'FUT', 'CE', 'PE'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_tick_size'
      AND conrelid = 'kite_trade.instruments'::regclass
  ) THEN
    ALTER TABLE kite_trade.instruments ADD CONSTRAINT chk_tick_size CHECK (tick_size > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_lot_size'
      AND conrelid = 'kite_trade.instruments'::regclass
  ) THEN
    ALTER TABLE kite_trade.instruments ADD CONSTRAINT chk_lot_size CHECK (lot_size > 0);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS kite_trade.nifty_market_candles (
  instrument_id BIGINT NOT NULL
    REFERENCES kite_trade.instruments(id),
  interval_minutes SMALLINT NOT NULL,
  candle_time TIMESTAMPTZ NOT NULL,
  open NUMERIC(12, 2) NOT NULL,
  high NUMERIC(12, 2) NOT NULL,
  low NUMERIC(12, 2) NOT NULL,
  close NUMERIC(12, 2) NOT NULL,
  volume BIGINT,
  open_interest BIGINT,
  PRIMARY KEY (instrument_id, interval_minutes, candle_time),
  CHECK (high >= low),
  CHECK (high >= open AND high >= close),
  CHECK (low <= open AND low <= close)
);

CREATE INDEX IF NOT EXISTS idx_candles_time
  ON kite_trade.nifty_market_candles (candle_time);

-- SQL Server: execute this section separately; do not run it in PostgreSQL.
IF SCHEMA_ID(N'kite_trade') IS NULL
BEGIN
  EXEC(N'CREATE SCHEMA [kite_trade]');
END
GO

IF OBJECT_ID(N'[kite_trade].[instruments]', N'U') IS NULL
BEGIN
  CREATE TABLE [kite_trade].[instruments] (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    instrument_token BIGINT NOT NULL,
    exchange_token BIGINT NULL,
    trading_symbol NVARCHAR(100) NOT NULL,
    [name] NVARCHAR(100) NULL,
    exchange NVARCHAR(20) NOT NULL,
    segment NVARCHAR(30) NOT NULL,
    instrument_type NVARCHAR(10) NOT NULL,
    expiry DATE NULL,
    strike DECIMAL(18,4) NOT NULL CONSTRAINT DF_kite_trade_instruments_strike DEFAULT 0,
    tick_size DECIMAL(12,4) NOT NULL,
    lot_size INT NOT NULL,
    last_price DECIMAL(18,4) NULL,
    updated_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_kite_trade_instruments_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT chk_instrument_type CHECK (instrument_type IN ('EQ', 'FUT', 'CE', 'PE')),
    CONSTRAINT chk_tick_size CHECK (tick_size > 0),
    CONSTRAINT chk_lot_size CHECK (lot_size > 0)
  );
END
GO

IF COL_LENGTH(N'kite_trade.instruments', N'exchange_token') IS NULL
  ALTER TABLE [kite_trade].[instruments] ADD exchange_token BIGINT NULL;
IF COL_LENGTH(N'kite_trade.instruments', N'name') IS NULL
  ALTER TABLE [kite_trade].[instruments] ADD [name] NVARCHAR(100) NULL;
IF COL_LENGTH(N'kite_trade.instruments', N'segment') IS NULL
  ALTER TABLE [kite_trade].[instruments] ADD segment NVARCHAR(30) NULL;
IF COL_LENGTH(N'kite_trade.instruments', N'instrument_type') IS NULL
  ALTER TABLE [kite_trade].[instruments] ADD instrument_type NVARCHAR(10) NULL;
IF COL_LENGTH(N'kite_trade.instruments', N'expiry') IS NULL
  ALTER TABLE [kite_trade].[instruments] ADD expiry DATE NULL;
IF COL_LENGTH(N'kite_trade.instruments', N'strike') IS NULL
  ALTER TABLE [kite_trade].[instruments] ADD strike DECIMAL(18,4) NULL;
IF COL_LENGTH(N'kite_trade.instruments', N'tick_size') IS NULL
  ALTER TABLE [kite_trade].[instruments] ADD tick_size DECIMAL(12,4) NULL;
IF COL_LENGTH(N'kite_trade.instruments', N'lot_size') IS NULL
  ALTER TABLE [kite_trade].[instruments] ADD lot_size INT NULL;
IF COL_LENGTH(N'kite_trade.instruments', N'last_price') IS NULL
  ALTER TABLE [kite_trade].[instruments] ADD last_price DECIMAL(18,4) NULL;
IF COL_LENGTH(N'kite_trade.instruments', N'updated_at') IS NULL
  ALTER TABLE [kite_trade].[instruments] ADD updated_at DATETIMEOFFSET NULL;
GO

IF COL_LENGTH(N'kite_trade.instruments', N'instrument_name') IS NOT NULL
  EXEC(N'UPDATE [kite_trade].[instruments] SET [name] = COALESCE([name], instrument_name)');

UPDATE [kite_trade].[instruments]
SET segment = COALESCE(segment, exchange),
    instrument_type = COALESCE(instrument_type, N'EQ'),
    strike = COALESCE(strike, 0),
    tick_size = COALESCE(tick_size, 0.05),
    lot_size = COALESCE(lot_size, 1),
    updated_at = COALESCE(updated_at, SYSUTCDATETIME());

ALTER TABLE [kite_trade].[instruments] ALTER COLUMN segment NVARCHAR(30) NOT NULL;
ALTER TABLE [kite_trade].[instruments] ALTER COLUMN instrument_type NVARCHAR(10) NOT NULL;
ALTER TABLE [kite_trade].[instruments] ALTER COLUMN strike DECIMAL(18,4) NOT NULL;
ALTER TABLE [kite_trade].[instruments] ALTER COLUMN tick_size DECIMAL(12,4) NOT NULL;
ALTER TABLE [kite_trade].[instruments] ALTER COLUMN lot_size INT NOT NULL;
ALTER TABLE [kite_trade].[instruments] ALTER COLUMN updated_at DATETIMEOFFSET NOT NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'uq_kite_trade_instruments_token'
    AND object_id = OBJECT_ID(N'[kite_trade].[instruments]')
)
  CREATE UNIQUE INDEX uq_kite_trade_instruments_token
    ON [kite_trade].[instruments](instrument_token);
GO

IF OBJECT_ID(N'[kite_trade].[Nifty_market_candles]', N'U') IS NULL
BEGIN
  CREATE TABLE [kite_trade].[Nifty_market_candles] (
    instrument_id BIGINT NOT NULL
      REFERENCES [kite_trade].[instruments](id),
    interval_minutes SMALLINT NOT NULL,
    candle_time DATETIMEOFFSET NOT NULL,
    [open] DECIMAL(12, 2) NOT NULL,
    [high] DECIMAL(12, 2) NOT NULL,
    [low] DECIMAL(12, 2) NOT NULL,
    [close] DECIMAL(12, 2) NOT NULL,
    volume BIGINT NULL,
    open_interest BIGINT NULL,
    CONSTRAINT PK_kite_trade_nifty_market_candles
      PRIMARY KEY (instrument_id, interval_minutes, candle_time),
    CHECK ([high] >= [low]),
    CHECK ([high] >= [open] AND [high] >= [close]),
    CHECK ([low] <= [open] AND [low] <= [close])
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'idx_candles_time'
    AND object_id = OBJECT_ID(N'[kite_trade].[Nifty_market_candles]')
)
BEGIN
  CREATE INDEX idx_candles_time
    ON [kite_trade].[Nifty_market_candles] (candle_time);
END
GO
