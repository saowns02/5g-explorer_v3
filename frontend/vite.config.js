import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api is proxied to the FastAPI service so the frontend can run
// against the real backend with VITE_API_URL=/api.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  build: {
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'node',
  },
});
