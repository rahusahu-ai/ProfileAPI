const { Router } = require('express');
const router = Router();
const {
	kiteLogin,
	kiteCallback,
	getKiteProfile,
	getAllInstruments,
	getInstrumentsByExchange,
	getNiftyIndexPerMinute
} = require('../controllers/kiteController');

router.get('/kiteLogin', kiteLogin);
router.get('/callback', kiteCallback);
router.get('/instruments', getAllInstruments);
router.get('/instruments/:exchange', getInstrumentsByExchange);
router.get('/getNiftyIndexPerMinute', getNiftyIndexPerMinute);
router.post('/getNiftyIndexPerMinute', getNiftyIndexPerMinute);
router.get('/getKiteProfile', getKiteProfile);

module.exports = router;
