import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';

const isVercel = !!process.env.VERCEL;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(isVercel ? [] : [mkcert()])
  ],
  server: {
    https: !isVercel,
    port: 5174,
    host: true
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : 'local'),
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('ko-KR', { timeZone: 'Australia/Brisbane' }))
  }
});
