export * from './types';

export { Video } from './components/Video';
export type { VideoHandle } from './components/Video';
export { Audio } from './components/Audio';
export type { AudioHandle } from './components/Audio';
export { MusicPlayer } from './components/MusicPlayer';
export type { MusicPlayerHandle } from './components/MusicPlayer';

export { useVideoPlayer } from './hooks/useVideoPlayer';
export { useAudioPlayer } from './hooks/useAudioPlayer';
export type { AudioControls } from './hooks/useAudioPlayer';
export { useMusicPlayer } from './hooks/useMusicPlayer';
export type { MusicControls, QueueSnapshot } from './hooks/useMusicPlayer';
export { usePlaybackState } from './hooks/usePlaybackState';
export type { PlaybackDerived } from './hooks/usePlaybackState';
export { useRemoteControls } from './hooks/useRemoteControls';
export type { RemoteCommand } from './hooks/useRemoteControls';

export { MediaProvider, useMedia } from './context/MediaProvider';
export type { MediaProviderProps } from './context/MediaProvider';

export {
  buildOrder,
  createQueue,
  currentIndex,
  currentTrack,
  nextCursor,
  previousCursor,
  reshuffle,
  setRepeat,
} from './core/PlaylistManager';
export type { QueueState } from './core/PlaylistManager';
export { CastManager, castManager } from './core/CastManager';
export { DownloadManager } from './core/DownloadManager';
export type { DownloadInfo } from './core/DownloadManager';

export { default as AudioNative } from './native/AudioNative';
export { default as MusicPlayerNative } from './native/MusicPlayerNative';
export { default as CacheNative } from './native/CacheNative';
export { Commands as VideoCommands, default as ObsidianVideoNative } from './native/VideoNative';
