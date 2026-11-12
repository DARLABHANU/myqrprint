import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./src/', import.meta.url)),
  base: './',
  server: {
    port: 5180,
    strictPort: false,
  },
  build: {
    outDir: fileURLToPath(new URL('./.vite/renderer/main_window/', import.meta.url)),
    emptyOutDir: true,
  },
});
