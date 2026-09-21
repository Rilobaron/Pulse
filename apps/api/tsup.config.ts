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
  // tsup externalizes everything listed in `dependencies` (express, mongoose, bullmq, ...),
  // so the runtime image MUST ship a production node_modules (see apps/api/Dockerfile).
  // @pulse/shared is the exception: it is a workspace package whose entry is TypeScript
  // source (./src/index.ts), which Node cannot load — it has to be inlined into the bundle.
  noExternal: ['@pulse/shared'],
  // Emit a CJS-compatible shim for `import.meta.url` (used by src/config/env.ts);
  // without it esbuild replaces `import.meta` with `{}` and startup throws.
  shims: true,
});
