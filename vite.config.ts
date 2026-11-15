import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

const VERSION = pkg.version;
const SHA = gitSha();

/** Writes docs/sw.js from sw/sw.js with this build's version and every output file to precache. */
function serviceWorker(): Plugin {
  let outDir = 'docs';
  return {
    name: 'glowfall-sw',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      // og.png is only for link previews; .nojekyll is for GitHub.
      const precache = files.filter((f) => !['sw.js', 'og.png', '.nojekyll'].includes(f)).sort();
      const src = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8')
        .replace('__VERSION__', JSON.stringify(`${VERSION}-${SHA}`))
        .replace('__FILES__', JSON.stringify(precache));
      writeFileSync(join(outDir, 'sw.js'), src);
    },
  };
}

// base './' + outDir 'docs' → works on GitHub Pages whether it serves the repo root
// (index.html redirects to docs/) or the /docs folder directly.
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
    __GIT_SHA__: JSON.stringify(SHA),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: { outDir: 'docs', emptyOutDir: true },
});
