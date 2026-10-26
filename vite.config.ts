import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PORT = process.env.CALLBACK_PORT ?? '4317';

// Vite serves the dashboard in dev (with HMR) and proxies API + SSE to the
// local Callback server. In production the server serves the built files itself.
export default defineConfig({
  root: 'web',
  resolve: {
    alias: { '@shared': path.resolve(root, 'src/shared') },
  },
  server: {
    port: 5317,
    fs: { allow: [root] },
    proxy: {
      '/api': { target: `http://127.0.0.1:${SERVER_PORT}`, changeOrigin: true },
      '/events': {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        changeOrigin: true,
        // Server-Sent Events must not be buffered by the proxy.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
          });
        },
      },
    },
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
});
