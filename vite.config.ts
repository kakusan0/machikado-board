import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // 画面に出す版（ビルドした日時）。公開が最新になったかを見分けるため
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), rules: resolve(__dirname, 'rules.html') },
    },
  },
});
