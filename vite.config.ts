import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the production bundle works from any static host path.
  base: './',
  plugins: [react(), tailwindcss()],
});
