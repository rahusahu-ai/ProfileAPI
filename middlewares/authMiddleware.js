// middlewares/authMiddleware.js
const jwt = require('../jwt');

module.exports = (req, res, next) => {
  console.log('Auth Middleware Invoked'+ req.headers.authorization);
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
