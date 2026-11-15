// Headless driver: NODE_PATH=$(npm root -g) node tools/audio-check.cjs   (BASE=http://127.0.0.1:5173/)
const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE ?? 'http://127.0.0.1:5173/';
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  await page.goto(base + 'tools/audio-check.html?auto');
  await page.waitForFunction(() => window.__result, null, { timeout: 180000 });
  console.log(JSON.stringify(await page.evaluate(() => window.__result), null, 1));
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  await browser.close();
})();
