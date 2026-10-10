-- sp_create_post.sql..
USE ProfileDB;
GO
IF OBJECT_ID('dbo.sp_create_post', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_create_post;
GO

CREATE PROCEDURE dbo.sp_create_post
  @p_name NVARCHAR(200),
  @title NVARCHAR(500),
  @link NVARCHAR(1000),
  @date_time DATETIME2,
  @sub_title NVARCHAR(500)
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO posts (p_name, title, link, date_time, sub_title)
  VALUES (@p_name, @title, @link, @date_time, @sub_title);
  SELECT SCOPE_IDENTITY() AS id;
END
GO
