import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const frontendRoot = fileURLToPath(new URL('./frontend/', import.meta.url));

export default defineConfig({
  root: frontendRoot,
  publicDir: `${frontendRoot}/public`,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': `${frontendRoot}/src` },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.CRAFTAIB_UI_PORT || 4185),
    strictPort: true,
    proxy: {
      '/api': { target: process.env.CRAFTAIB_API_TARGET || 'http://127.0.0.1:4184', changeOrigin: false },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
