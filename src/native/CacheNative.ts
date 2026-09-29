import type { Spec } from '../specs/NativeObsidianCache';
import { requireTurboModule } from './requireTurboModule';

/** Offline cache / download TurboModule. See `requireTurboModule` for why there
 * is no `NativeModules` fallback.
 *
 * Note this throws at *import* time if the module is missing, which is
 * deliberate: `core/DownloadManager.ts` gates on `CacheNative` being usable, so
 * a silent `undefined` here would surface much later as a download that never
 * resolves. */
const ObsidianCache = requireTurboModule<Spec>('ObsidianCache');

export default ObsidianCache;
