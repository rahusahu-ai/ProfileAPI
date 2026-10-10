-- Run only the section matching your database engine.

-- PostgreSQL
CREATE TABLE IF NOT EXISTS "userProfile_sesssion" (
  id BIGSERIAL PRIMARY KEY,
  kite_user_id VARCHAR(64) NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  public_token TEXT,
  session_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SQL Server: execute this section separately; do not run it in PostgreSQL.
IF OBJECT_ID('dbo.userProfile_sesssion', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.userProfile_sesssion (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    kite_user_id NVARCHAR(64) NOT NULL UNIQUE,
    access_token NVARCHAR(MAX) NOT NULL,
    public_token NVARCHAR(MAX) NULL,
    session_data NVARCHAR(MAX) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO