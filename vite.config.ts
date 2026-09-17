import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwaPlugin } from './scripts/pwa-plugin';

// base: './' 로 두어 GitHub Pages / Netlify / Vercel 어디에 올려도
// 하위 경로에서 에셋 경로가 깨지지 않도록 한다.
export default defineConfig({
  plugins: [react(), pwaPlugin()],
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
