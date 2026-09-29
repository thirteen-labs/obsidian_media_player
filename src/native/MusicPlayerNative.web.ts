import { notOnWeb } from './notOnWeb';
import type { Spec } from '../specs/NativeObsidianMusicPlayer';

/**
 * Web stub for the ObsidianMusicPlayer TurboModule.
 *
 * Exists so that *importing* the package on web does not throw. The native
 * module genuinely has no browser equivalent, but the previous behaviour —
 * `NativeModules.ObsidianMusicPlayer` being undefined and
 * `MusicPlayerNative.ts` throwing "native module is not linked" at import time
 * — took down every web bundle, including apps that never touch music, because
 * `src/index.ts` re-exports the hook and the component unconditionally.
 *
 * Nothing routes through this at runtime: `hooks/useMusicPlayer.web.ts`
 * implements the queue over a single `HTMLAudioElement` and never imports this
 * module. It is here because `src/index.ts` exports it as public API, and
 * because a direct `import MusicPlayerNative from 'obsidian-media-player'` on
 * web should fail with an explanation rather than a bundler error.
 *
 * Every method throws on *call*, not on import. That distinction is the whole
 * point: importing is safe, using is a clear error.
 */
const stub = new Proxy({} as Spec, {
  get(_target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'then') return undefined; // never look thenable
    return () => {
      throw notOnWeb(`MusicPlayerNative.${String(prop)}`);
    };
  },
});

export default stub;
