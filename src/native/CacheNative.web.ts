import type { Spec } from '../specs/NativeObsidianCache';

/**
 * Web stub for the ObsidianCache TurboModule.
 *
 * Exports `undefined` on purpose, and that matters:
 * `core/DownloadManager.ts` gates on `!!CacheNative && typeof
 * CacheNative.download === 'function'`. A throwing stub would satisfy that
 * check and permanently disable the web fallback, because the Proxy's `get`
 * returns a function for every property. Exporting a falsy value is what lets
 * `DownloadManager` reach its CacheStorage path on web, which is the only
 * offline cache a browser can offer.
 *
 * The other reason this file exists: `CacheNative.ts` looks web-safe at
 * runtime — it has no import-time throw — but it calls
 * `require('../specs/NativeObsidianCache')` inside its New Architecture
 * branch. Bundlers follow `require()` **statically**, so that spec (and its
 * `import { TurboModuleRegistry } from 'react-native'`, which react-native-web
 * does not implement) was still in the web module graph. `npm run bundle:web`
 * caught this; no type check or runtime test would have.
 *
 * See `MusicPlayerNative.web.ts` for the sibling rationale.
 */
export default undefined as unknown as Spec;
