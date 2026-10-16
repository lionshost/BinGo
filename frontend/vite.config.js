import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Thẻ og:image / og:url bắt buộc là URL tuyệt đối thì Facebook/Zalo mới hiện ảnh xem trước.
// Domain lấy từ SITE_URL (tự đặt), hoặc biến có sẵn của Vercel / Netlify khi build.
function siteUrl() {
  const raw = process.env.SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    || process.env.URL // Netlify
    || '';
  return raw.replace(/\/+$/, '');
}

const injectSiteUrl = () => ({
  name: 'bingo-inject-site-url',
  transformIndexHtml: html => html.replaceAll('%SITE_URL%', siteUrl())
});

export default defineConfig({
  plugins: [injectSiteUrl()],
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
        map: resolve(import.meta.dirname, 'map.html'),
        login: resolve(import.meta.dirname, 'login.html'),
        admin: resolve(import.meta.dirname, 'admin.html')
      }
    }
  }
});
