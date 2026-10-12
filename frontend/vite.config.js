import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    // Chạy local: /api được chuyển sang backend Express (không cần VITE_API_URL).
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        map: resolve(import.meta.dirname, 'map.html')
      }
    }
  }
});
