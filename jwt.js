// jwt.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
const verify = (token) => jwt.verify(token, process.env.JWT_SECRET);

module.exports = { sign, verify };
