/**
 * Web bundle entry for the `npm run bundle:web` gate.
 *
 * Imports the package's *entire* public surface and parks it on a global, so
 * esbuild cannot tree-shake anything away. Bundling only the components an app
 * happens to use would miss exactly the defect this gate exists for: the web
 * build used to break on `import 'obsidian-media-player'` because `index.ts`
 * eagerly re-exports the TurboModule specs and the `NativeEventEmitter` hooks.
 * Every export has to survive bundling, not just the ones this file names.
 */
import * as ObsidianMediaPlayer from '../src/index';

(globalThis as any).ObsidianMediaPlayer = ObsidianMediaPlayer;
