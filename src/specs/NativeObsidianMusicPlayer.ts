import { TurboModule, TurboModuleRegistry } from 'react-native';

/**
 * TurboModule interface for the full-featured Music player: playlist/queue
 * management, background audio, lock-screen remote controls and streaming.
 */
export interface Spec extends TurboModule {
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;

  /** Enable / disable background audio mode (iOS AVAudioSession / Android foreground service). */
  setBackgroundEnabled: (enabled: boolean) => void;
  setQueue: (tracksJson: string) => void;
  addTracks: (tracksJson: string) => void;
  removeTrack: (id: string) => void;
  skipTo: (index: number) => void;
  next: () => void;
  previous: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setRepeatMode: (mode: string) => void;
  setShuffle: (shuffle: boolean) => void;
  setRemoteControls: (optionsJson: string) => void;
  /** Returns a JSON object describing current queue + active index. */
  getCurrentQueue: () => Promise<string>;
  getCurrentState: () => Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ObsidianMusicPlayer');
