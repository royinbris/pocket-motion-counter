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
    port: 5173,
    host: true
  }
});
