import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /** GitHub Pages 部署用的 base path，本地開發時可維持 '/' */
  base: './',
});
