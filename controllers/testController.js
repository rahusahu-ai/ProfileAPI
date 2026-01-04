const db = require('../db');
const { getPool, query, sql, one, insert, update: updateDb, remove: removeDb } = require('../db');
const DBCommunicator = require('../utils/dbCommunicator');
const logger = require('../utils/winstonLogger');


async function testMethod(req, res, next) {
    const dbCommunicator = new DBCommunicator();
    logger.info('Get All Invoked');
console.log('initialize:', typeof dbCommunicator.initialize);
console.log('initialise:', typeof dbCommunicator.initialise);
console.log('keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(dbCommunicator)));
    await dbCommunicator.initialise();
    logger.info('DB Communicator Initialized');
    const client = dbCommunicator.client;

  try {
    await dbCommunicator.beginTrans();
    const query = 'SELECT * FROM test_table ORDER BY id DESC';
    const result = await client.query(query);
    await dbCommunicator.commitTrans();
    res.json(result.rows);  
  } catch (err) { next(err); }
}
exports.testMethod = testMethod;

// A simple test method to verify the route is working  