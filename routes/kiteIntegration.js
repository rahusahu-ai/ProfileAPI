const { Router } = require('express');
const router = Router();
const { kiteLogin, kiteCallback } = require('../controllers/kiteController');

router.get('/kiteLogin', kiteLogin);
router.get('/callback', kiteCallback);

module.exports = router;
