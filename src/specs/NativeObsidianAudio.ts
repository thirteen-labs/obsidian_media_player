import { TurboModule, TurboModuleRegistry } from 'react-native';

/**
 * TurboModule interface for the headless Audio player.
 * The native implementations (iOS / Android) conform to this spec under the
 * New Architecture, and register the same methods under the legacy bridge.
 */
export interface Spec extends TurboModule {
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;

  load: (sourceJson: string) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setLoop: (loop: boolean) => void;
  /** Returns a JSON-encoded PlaybackState. */
  getCurrentState: () => Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ObsidianAudio');
