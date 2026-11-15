// Render public/icon.svg to the PNG app icons: NODE_PATH=$(npm root -g) node tools/icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const pub = path.join(__dirname, '..', 'public');
  const svg = fs.readFileSync(path.join(pub, 'icon.svg'), 'utf8');
  const b = await chromium.launch();
  for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
    const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(`<style>html,body{margin:0;background:#050816}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block">`);
    await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(pub, name) });
    await p.close();
  }
  await b.close();
  console.log('icons written');
})();
