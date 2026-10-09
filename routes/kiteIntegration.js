const { Router } = require('express');
const router = Router();
const { kiteLogin, kiteCallback, getKiteProfile, getNiftyIndexPerMinute } = require('../controllers/kiteController');

router.get('/kiteLogin', kiteLogin);
router.get('/callback', kiteCallback);
router.get('/getNiftyIndexPerMinute', getNiftyIndexPerMinute);
router.get('/getKiteProfile', getKiteProfile);

module.exports = router;
