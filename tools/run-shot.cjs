// node tools/run-shot.cjs <outPrefix> [seconds...]  — clicks Release, screenshots at given seconds
const { chromium } = require('playwright');
(async () => {
  const [, , prefix = 'run', ...times] = process.argv;
  const base = process.env.BASE ?? 'http://127.0.0.1:5173/';
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base + (process.env.Q ? '?' + process.env.Q : ''), { waitUntil: 'networkidle' });
  if (process.env.PRESET) await page.selectOption('select.presets', process.env.PRESET);
  await page.waitForTimeout(500);
  await page.click('button.play');
  let prev = 0;
  for (const t of (times.length ? times : ['5']).map(Number)) {
    await page.waitForTimeout((t - prev) * 1000);
    prev = t;
    await page.screenshot({ path: `${prefix}-${t}.png` });
  }
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  await browser.close();
  console.log('done');
})();
