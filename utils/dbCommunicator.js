const sql = require("mssql");
const logger = require('./winstonLogger')
const AppGlobal = require('./appGlobal');
const configData = require('../config.json');
const { Pool } = require('pg');
const Constants = require("./constant");

class DBCommunicator {
    _UseSQLServer;
    _UsePGServer;
    _connectionPool;
    _client;
    _DBConfigDetails;

    constructor() {
        this._UseSQLServer = null;
        this._connectionPool = null;
        this._client = null;
        if (process.env.ENV_USEDB == Constants.SQL_SERVER) {
            AppGlobal.isSqlServerDb = true;
            AppGlobal.isPostreServerDb = false;
        }
        else if (process.env.ENV_USEDB == Constants.POSTGRES) {
            AppGlobal.isSqlServerDb = false;
            AppGlobal.isPostreServerDb = true;
        }
    }

    async initialise() {
        try {
            if (AppGlobal.isSqlServerDb) {
                this._UseSQLServer = true;
                this._UsePGServer = true
                logger.info(process.env.NODE_ENV)
                logger.info(process.env.ENV_DB)
                logger.info(process.env.ENV_HOST)
                logger.info(process.env.ENV_USER)
                logger.info(process.env.ENV_PWD)

                if (!process.env.ENV_DB && process.env.ENV_HOST && process.env.ENV_USER && process.env.ENV_PWD) {
                    logger.info("inside the if condition ")
                    logger.info(process.env.ENV_DB + " :: " + process.env.ENV_HOST + " :: " + process.env.ENV_USER + " :: " + process.env.ENV_PWD)

                    this._DBConfigDetails = {
                        "user": process.env.ENV_USER,
                        "password": process.env.ENV_PWD,
                        "server": process.env.ENV_HOST,
                        "database": process.env.ENV_DB_DB,
                        "trustServerCertificate": true,
                        "options": {
                            "enableArithAbort": true
                        },
                        "connectionTimeout": 1500000,
                        "pool": {
                            "max": 10,
                            "min": 0,
                            "idleTimeoutMillis": 300000
                        }
                    }
                }
                else {
                    this._DBConfigDetails = configData.SQLSERVER_CONFIG;
                }

                this._connectionPool = new sql.ConnectionPool(this._DBConfigDetails);
                const connectDetails = await this._connectionPool.connect();
                this._client = new sql.Transaction(this._connectionPool);


            }
            else if (AppGlobal.isPostreServerDb) {
                this._UseSQLServer = false;
                this._UsePGServer = true
                logger.info(process.env.PG_PORT)
                logger.info(process.env.PG_DATABASE)
                logger.info(process.env.PG_HOST)
                logger.info(process.env.PG_USER)
                logger.info(process.env.PG_PASSWORD)

                if (process.env.ENV_DB && process.env.ENV_HOST && process.env.ENV_USER && process.env.ENV_PWD) {
                    logger.info("inside the if condition ")
                    logger.info(process.env.ENV_DB + " :: " + process.env.ENV_HOST + " :: " + process.env.ENV_USER + " :: " + process.env.ENV_PWD)

                    this._DBConfigDetails = {
                        "user": process.env.ENV_USER,
                        "password": process.env.ENV_PWD,
                        "host": process.env.ENV_HOST,
                        "database": process.env.ENV_DB,
                        "port": 5432,
                        "ssl": {
                            "rejectUnauthorized": false
                        }
                    }
                }
                else {
                    logger.info(configData.POSTGRES_CONFIG.database + " " + configData.POSTGRES_CONFIG.host)
                    logger.info(configData.POSTGRES_CONFIG.port + " " + configData.POSTGRES_CONFIG.host)

                    this._DBConfigDetails = configData.POSTGRES_CONFIG;
                }
                logger.info("insde the before new pool")
                this._connectionPool = new Pool(this._DBConfigDetails);
                logger.info("Pool created")
                this._client = await this._connectionPool.connect()
                logger.info("Client created , DB connected")

            }
        }
        catch (error) {
            logger.info(error.message);
        }
        return 0;
    }

    get useSQLServer() {
        return this._UseSQLServer;
    }

    set useSQLServer(value) {
        return this._UseSQLServer = value;
    }

    get usePGServer() {
        return this._UsePGServer;
    }

    set usePGServer(value) {
        return this._UsePGServer = value;
    }

    get connectionPool() {
        return this._connectionPool;
    }

    set connectionPool(value) {
        this._connectionPool = value;
    }

    set client(value) {
        this._client = value;
    }

    get client() {
        return this._client;
    }

    async beginTrans() {
        if (this._UseSQLServer)
            return await this._client.begin();

        if (this._UsePGServer)
            return await this._client.query('BEGIN')
    }

    async rollbackTrans() {
        if (this._UseSQLServer)
            return await this._client.rollback();

        if (this._UsePGServer)
            return await this._client.query('ROLLBACK')
    }

    async commitTrans() {
        if (this._UseSQLServer)
            return await this._client.commit();

        if (this._UsePGServer)
            return await this._client.query('COMMIT')
    }

    async closeConnection() {
        if (this._UseSQLServer)
            return await this._connectionPool.close();

        if (this._UsePGServer)
            return this._client.release()
    }
}

module.exports = DBCommunicator;