import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';

const isVercel = !!process.env.VERCEL;

// 호주 브리즈번 기준 날짜.시간 포맷 생성
const now = new Date();
const formattedBrisbane = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Australia/Brisbane',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}).formatToParts(now);

const partMap = Object.fromEntries(formattedBrisbane.map(p => [p.type, p.value]));
const versionString = `${partMap.year}.${partMap.month}.${partMap.day}.${partMap.hour}${partMap.minute}`;
const buildTimeStr = new Date().toLocaleString('ko-KR', { timeZone: 'Australia/Brisbane' });

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
    __APP_VERSION__: JSON.stringify(versionString),
    __BUILD_TIME__: JSON.stringify(buildTimeStr)
  }
});
