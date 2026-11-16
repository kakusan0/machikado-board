import { defineConfig } from 'vite';
// 画面に出す版（ビルドした日時）。公開が最新になったかを見分けるため
export default defineConfig({ define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') } });
