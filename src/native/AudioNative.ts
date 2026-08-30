import { NativeModules } from 'react-native';
import type { Spec } from '../specs/NativeObsidianAudio';

/**
 * Returns the Audio module, preferring the New Architecture TurboModule and
 * falling back to the legacy bridge NativeModule when the app is not running
 * under the New Architecture.
 */
function resolveAudio(): Spec {
  const isNewArch = (global as any).__turboModuleProxy != null;
  if (isNewArch) {
    return require('../specs/NativeObsidianAudio').default as Spec;
  }
  return (NativeModules as any).ObsidianAudio as Spec;
}

const ObsidianAudio = resolveAudio();

if (!ObsidianAudio) {
  throw new Error(
    '[obsidian-media-player] ObsidianAudio native module is not linked. ' +
      'Did you run `pod install` (iOS) and rebuild (Android)?'
  );
}

export default ObsidianAudio;
