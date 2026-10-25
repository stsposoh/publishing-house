import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5178, strictPort: true },
  build: { chunkSizeWarningLimit: 900 },
});
