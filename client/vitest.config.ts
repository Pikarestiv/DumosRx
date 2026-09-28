import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    exclude: ['**/node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'json'],
      reportsDirectory: './coverage',
      include: ['lib/**', 'hooks/**', 'components/**', 'app/**'],
      exclude: [
        '**/__tests__/**',
        '**/*.d.ts',
        '**/node_modules/**',
        'components/ui/**',
      ],
    },
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
