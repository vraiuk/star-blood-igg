import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5181 },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
