import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' + outDir 'docs' → works on GitHub Pages whether it serves the repo root
// (index.html redirects to docs/) or the /docs folder directly.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'docs', emptyOutDir: true },
});
