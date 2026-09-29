import type { Spec } from '../specs/NativeObsidianMusicPlayer';
import { requireTurboModule } from './requireTurboModule';

/** Music player TurboModule. See `requireTurboModule` for why there is no
 * `NativeModules` fallback. */
const ObsidianMusicPlayer = requireTurboModule<Spec>('ObsidianMusicPlayer');

export default ObsidianMusicPlayer;
