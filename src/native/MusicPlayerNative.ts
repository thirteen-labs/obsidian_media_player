import { NativeModules } from 'react-native';
import type { Spec } from '../specs/NativeObsidianMusicPlayer';

function resolveMusicPlayer(): Spec {
  const isNewArch = (global as any).__turboModuleProxy != null;
  if (isNewArch) {
    return require('../specs/NativeObsidianMusicPlayer').default as Spec;
  }
  return (NativeModules as any).ObsidianMusicPlayer as Spec;
}

const ObsidianMusicPlayer = resolveMusicPlayer();

if (!ObsidianMusicPlayer) {
  throw new Error(
    '[obsidian-media-player] ObsidianMusicPlayer native module is not linked. ' +
      'Did you run `pod install` (iOS) and rebuild (Android)?'
  );
}

export default ObsidianMusicPlayer;
