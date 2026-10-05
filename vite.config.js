import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  // Relative Pfade: GitHub Pages liefert die App unter /<repo>/ aus.
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
  server: { host: true },
});
