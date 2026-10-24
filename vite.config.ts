import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/.tooling/**','**/tmp/**','**/output/**','**/test-results/**','**/playwright-report/**'] } }, optimizeDeps: { include: ['@tiptap/core','@tiptap/react','@tiptap/starter-kit'] },
  clearScreen: false,
  build: { target: 'es2022', chunkSizeWarningLimit: 650 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
