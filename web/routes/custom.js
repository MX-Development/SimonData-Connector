const express = require('express');
const router = express.Router();

// Get Authentication
router.post('/back-in-stock', async (req, res) => {
  console.log('Back in stock data: ', req.body);
});

module.exports = router;