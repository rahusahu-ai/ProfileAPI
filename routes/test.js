// create a get method for testing
const testController = require('../controllers/testController');  
const express = require('express');
const router = express.Router();    
router.get('/', testController.testMethod);

  

module.exports = router;    