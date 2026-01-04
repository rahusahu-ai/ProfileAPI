// swagger.js
const swaggerJSDoc = require('swagger-jsdoc');
require('dotenv').config();

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'Profile Back-end API', version: '1.0.0', description: 'Subscribers + Posts API' },
    servers: [{ url: `http://localhost:${process.env.PORT || 3000}` }]
  },
  apis: ['./routes/*.js', './controllers/*.js']
};

module.exports = swaggerJSDoc(options);
