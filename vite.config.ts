import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { imageGenerationPlugin } from './server/image-generation';

export default defineConfig({
  base: './',
  plugins: [react(), imageGenerationPlugin()],
  server: { host: '127.0.0.1' },
  build: { target: 'es2022' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
