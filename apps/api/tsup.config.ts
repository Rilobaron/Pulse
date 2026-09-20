import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    worker: 'src/worker.ts',
    notificationWorker: 'src/notificationWorker.ts',
  },
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  // Mongoose ships complex conditional exports — bundling is fine, keep it external
  // only if issues arise. Everything else gets bundled into single CJS files.
});
