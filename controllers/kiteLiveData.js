const { KiteTicker } = require('kiteconnect');

const ticker = new KiteTicker({
  api_key: process.env.KITE_API_KEY || 'd65pes216aml7rs0',
  access_token: storedAccessToken // Replace with your actual access token
});

ticker.connect();

ticker.on('ticks', function(ticks) {
  console.log('Live ticks:', ticks);
});

ticker.on('connect', function() {
  const tokens = [256265, 738561]; // example instrument tokens
  ticker.subscribe(tokens);
  ticker.setMode(ticker.modeFull, tokens);
});

ticker.on('error', function(err) {
  console.error('Ticker error:', err);
});

ticker.on('close', function(reason) {
  console.log('Ticker closed:', reason);
});