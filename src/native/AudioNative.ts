import type { Spec } from '../specs/NativeObsidianAudio';
import { requireTurboModule } from './requireTurboModule';

/** Headless audio TurboModule. See `requireTurboModule` for why there is no
 * `NativeModules` fallback. */
const ObsidianAudio = requireTurboModule<Spec>('ObsidianAudio');

export default ObsidianAudio;
