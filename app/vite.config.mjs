import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  define: {
    'process.env': JSON.stringify({ NODE_ENV: mode === 'production' ? 'production' : 'development' }),
  },
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@pascal-app/core', '@pascal-app/nodes', '@pascal-app/viewer'],
    noDiscovery: true,
    include: [
      'howler',
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-dev-runtime',
      'react/jsx-runtime',
      'scheduler',
      'stats.js',
      'use-sync-external-store/shim/with-selector.js',
    ],
    needsInterop: ['howler', 'scheduler', 'stats.js', 'use-sync-external-store/shim/with-selector.js'],
  },
  resolve: {
    dedupe: ['@react-three/fiber', 'react', 'react-dom', 'three', 'zustand'],
    alias: {
      'next/image': fileURLToPath(new URL('./src/pascal/next-image.jsx', import.meta.url)),
      'next/link': fileURLToPath(new URL('./src/pascal/next-link.jsx', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8791',
    },
  },
}));
