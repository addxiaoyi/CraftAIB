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
      '/api': { target: process.env.CRAFTAIB_API_TARGET || `http://127.0.0.1:${process.env.CRAFTAIB_API_PORT || 4184}`, changeOrigin: false },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Both previews share Three. Keep its stable runtime out of viewport code.
          includeDependenciesRecursively: false,
          groups: [
            { name: 'three-core', test: /[\\/]three[\\/]build[\\/]three\.core\.js$/ },
            { name: 'three-webgl', test: /[\\/]three[\\/]build[\\/]three\.module\.js$/ },
          ],
        },
      },
    },
  },
});
