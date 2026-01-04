-- create_tables_sqlserver.sql
IF DB_ID('ProfileDB') IS NULL
BEGIN
  CREATE DATABASE ProfileDB;
END
GO

USE ProfileDB;
GO

IF OBJECT_ID('dbo.subscribers', 'U') IS NULL
BEGIN
  CREATE TABLE subscribers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    email NVARCHAR(200) NOT NULL,
    datetime DATETIME2 NOT NULL
  );
END
GO

IF OBJECT_ID('dbo.posts', 'U') IS NULL
BEGIN
  CREATE TABLE posts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    p_name NVARCHAR(200),
    title NVARCHAR(500),
    link NVARCHAR(1000),
    date_time DATETIME2,
    sub_title NVARCHAR(500)
  );
END
GO

IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
  CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(100) UNIQUE NOT NULL,
    passwordHash NVARCHAR(200) NOT NULL
  );
END
GO
