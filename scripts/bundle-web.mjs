/**
 * Web bundle gate.
 *
 * Bundles the package's full public surface for the browser with esbuild,
 * resolving `react-native` to `react-native-web` and preferring `.web.*` files
 * the way Metro does. This is a real bundling pass, not a type check: the
 * failures it catches (a deep `react-native/Libraries/...` import, a value
 * import of an RN internal that react-native-web does not implement) are
 * bundler-level and cannot be caught any other way.
 *
 * The original defect was that *importing* the package on web crashed, because
 * `src/index.ts` re-exported the TurboModule specs and the `NativeEventEmitter`
 * hooks unconditionally. So the entry point pulls in every export and parks it
 * on a global to defeat tree-shaking — see `scripts/web-entry.ts`.
 *
 * Runs in CI as part of the gate. See to-be-done.md FG-2.1.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
  await build({
    absWorkingDir: root,
    entryPoints: ['scripts/web-entry.ts'],
    outfile: 'web-dist/bundle.js',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2019'],
    jsx: 'automatic',

    // Metro prefers platform extensions (`.web.ts` over `.ts`). esbuild does not
    // know about platform extensions, so the order has to be spelled out — and
    // it has to come first, or the native implementations get bundled instead.
    resolveExtensions: [
      '.web.ts',
      '.web.tsx',
      '.web.js',
      '.web.jsx',
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.json',
    ],

    // Also rewrites deep imports such as `react-native/Libraries/...`, which
    // then fail to resolve. That is intended: such an import is unreachable on
    // web and must not survive a bundle.
    alias: { 'react-native': 'react-native-web' },
    mainFields: ['browser', 'module', 'main'],
    conditions: ['browser', 'import', 'default'],

    define: {
      __DEV__: 'false',
      'process.env.NODE_ENV': '"production"',
      // `src/native/*.ts` feature-detects the New Architecture via
      // `(global as any).__turboModuleProxy`, which must read as undefined in a
      // browser rather than being a bare `global` reference.
      global: 'globalThis',
    },

    logLevel: 'warning',
  });
  console.log('bundle:web OK');
} catch (err) {
  // esbuild's `errors` array is far more readable than the thrown message.
  if (err && Array.isArray(err.errors) && err.errors.length) {
    console.error('bundle:web FAILED');
    for (const e of err.errors) {
      const loc = e.location;
      console.error(
        `  ${loc ? `${loc.file}:${loc.line}:${loc.column}` : '<input>'}: ${e.text}`
      );
    }
    process.exit(1);
  }
  throw err;
}
