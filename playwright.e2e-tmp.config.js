const base = require('./playwright.config');

module.exports = {
  ...base,
  reporter: 'line',
  use: { ...base.use, baseURL: 'http://localhost:5273' },
  webServer: [
    { command: 'node server/src/index.js', url: 'http://localhost:3101/api/health', env: { PORT: '3101' }, reuseExistingServer: false, timeout: 120000 },
    { command: 'npx vite --config vite.e2e-tmp.config.js', cwd: 'client', url: 'http://localhost:5273', reuseExistingServer: false, timeout: 120000 }
  ]
};
