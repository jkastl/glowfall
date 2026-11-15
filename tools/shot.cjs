// Screenshot helper (needs NODE_PATH=$(npm root -g)): node tools/shot.cjs "<query>" out.png [width height]
// e.g. node tools/shot.mjs "solo=switchback&t=8" /tmp/x.png
const { chromium } = require('playwright');
(async () => {
const [, , query = '', out = 'shot.png', w = '1180', h = '820'] = process.argv;
const base = process.env.BASE ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(base + (query ? '?' + query : ''), { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(process.env.WAIT ?? 1200));
await page.screenshot({ path: out });
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
console.log('saved', out);
})();
