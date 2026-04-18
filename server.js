const { createApp } = require('./lib/app');

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  const storage = require('./lib/storage');
  console.log(`Select-game on http://localhost:${PORT} (storage: ${storage.mode})`);
});
