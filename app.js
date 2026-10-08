// app.js
require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const authRoutes = require('./routes/auth');
const subscribersRoutes = require('./routes/subscriber');
const postsRoutes = require('./routes/post');
const testsRoutes = require('./routes/test');
const kiteRoutes = require('./routes/kiteIntegration');
const logger = require('./utils/winstonLogger');
const AppGlobal = require('./utils/appGlobal');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth', authRoutes);
app.use('/api/subscribers', subscribersRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/kite', kiteRoutes);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/', (req, res) => res.send('Profile Back-end API'));
logger.error('Application Started');
// Global error handler
AppGlobal.isPostreServerDb = true; // Example setting
AppGlobal.isSqlServerDb = false; // Example setting

// Global error handler


app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on http://localhost:${port} - Swagger: /api-docs`));

// If you want to run HTTPS server
// 
//https.createServer({
//  key: fs.readFileSync('key.pem'),
//  cert: fs.readFileSync('cert.pem')
//},app).listen(3001, () => console.log(`HTTPS Server listening on https://localhost:3001`));