import { notOnWeb } from './notOnWeb';
import type { Spec } from '../specs/NativeObsidianAudio';

/**
 * Web stub for the ObsidianAudio TurboModule.
 *
 * Same reasoning as `MusicPlayerNative.web.ts`: the native module threw "not
 * linked" at import time on web, which broke every web bundle via
 * `src/index.ts`. `hooks/useAudioPlayer.web.ts` provides the real web
 * implementation and never imports this.
 *
 * See `MusicPlayerNative.web.ts` for the full rationale.
 */
const stub = new Proxy({} as Spec, {
  get(_target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'then') return undefined; // never look thenable
    return () => {
      throw notOnWeb(`AudioNative.${String(prop)}`);
    };
  },
});

export default stub;
