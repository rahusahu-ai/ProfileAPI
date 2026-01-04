// db/index.js
require('dotenv').config();
const driver = (process.env.DB_DRIVER || 'postgres').toLowerCase();

if (driver === 'sqlserver') module.exports = require('./sqlserver');
else if (driver === 'postgres' || driver === 'pg') module.exports = require('./postgres');
else throw new Error(`Unsupported DB_DRIVER=${driver}`);
