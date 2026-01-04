// routes/subscribers.js
const { Router } = require('express');
const router = Router();
const { getAll, getById, create, update, remove } = require('../controllers/subscriberController');
const auth = require('../middlewares/authMiddleware');

/**
 * /api/subscribers
 */
router.get('/', auth, getAll);
router.get('/:id', auth, getById);
router.post('/', auth, create);
router.put('/:id', auth, update);
router.delete('/:id', auth, remove);

module.exports = router;
