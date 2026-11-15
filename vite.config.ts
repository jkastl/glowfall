import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * The source page is app.html, because the repo root's index.html is the *built* app (that's what
 * GitHub Pages serves). In dev, `/` is served from app.html; in a build it's renamed to index.html.
 */
function appEntry(): Plugin {
  return {
    name: 'glowfall-entry',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url?.startsWith('/?')) req.url = '/app.html' + req.url.slice(1);
        next();
      });
    },
  };
}

/** Renames dist/app.html to index.html, then writes dist/sw.js from sw/sw.js with this build's
 * version and every output file to precache. */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'glowfall-sw',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      renameSync(join(outDir, 'app.html'), join(outDir, 'index.html'));
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

// Builds into dist/; tools/deploy-build.sh copies that to the repo root, which GitHub Pages serves.
export default defineConfig({
  base: './',
  plugins: [react(), appEntry(), serviceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
    __GIT_SHA__: JSON.stringify(SHA),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: 'app.html' } },
});
