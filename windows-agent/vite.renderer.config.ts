import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('./src/', import.meta.url)),
  base: './',
  build: { outDir: fileURLToPath(new URL('./.vite/renderer/main_window/', import.meta.url)), emptyOutDir: true },
});
