import { defineConfig } from 'vite';

export default defineConfig({
  // served from https://stsposoh.github.io/publishing-house/
  base: '/publishing-house/',
  server: { port: 5178, strictPort: true },
  build: { chunkSizeWarningLimit: 900 },
});
