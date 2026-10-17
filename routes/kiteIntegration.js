const { Router } = require('express');
const router = Router();
const {
	kiteLogin,
	kiteCallback,
	getKiteProfile,
	getAllInstruments,
	getInstrumentsByExchange,
	getAllExchangeList,
	getSegmentList,
	getAllEntityList,
	getIndexDataForGivenTimeInterval,
	saveNiftyIndexCandles
} = require('../controllers/kiteController');

router.get('/kiteLogin', kiteLogin);
router.get('/callback', kiteCallback);
router.get('/instruments', getAllInstruments);
router.get('/instruments/:exchange', getInstrumentsByExchange);
router.get('/getAllExchangeList', getAllExchangeList);
router.get('/getSegmentList', getSegmentList);
router.get('/getAllEntityList', getAllEntityList);
router.get('/getNiftyIndexPerMinute', getIndexDataForGivenTimeInterval);
router.post('/getNiftyIndexPerMinute', getIndexDataForGivenTimeInterval);
router.post('/saveNiftyIndexCandles', saveNiftyIndexCandles);
router.get('/getKiteProfile', getKiteProfile);

module.exports = router;
