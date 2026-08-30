/**
 * Public type definitions for obsidian-media-player.
 *
 * These types describe the cross-platform contract shared by the <Video>,
 * <Audio> and <MusicPlayer> APIs. The native layers (iOS / Android) emit and
 * consume values that map directly onto these structures.
 */

export type MediaSourceType = 'file' | 'hls' | 'dash' | 'smooth' | 'progressive';

/** A playable media source. */
export interface MediaSource {
  /** Remote URL or local file path. */
  uri: string;
  /** Hint used by the native player to pick the right demuxer. Omit to auto-detect. */
  type?: MediaSourceType;
  /** Optional HTTP headers sent when fetching the resource. */
  headers?: Record<string, string>;
  /** For HLS/DASH with drm, a license server URL. */
  drmLicenseUri?: string;
  /** Whether this source may be cached on disk. Defaults to true. */
  cacheable?: boolean;
}

export type RepeatMode = 'off' | 'track' | 'queue';

export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'ended'
  | 'error';

/** Live snapshot of a player's state. Emitted by native on every change. */
export interface PlaybackState {
  status: PlaybackStatus;
  /** Current position in seconds. */
  position: number;
  /** Duration in seconds (0 until known). */
  duration: number;
  /** Playback rate (1 = normal, 0 = paused). */
  rate: number;
  /** Whether audio is muted. */
  muted: boolean;
  /** Volume 0..1. */
  volume: number;
  /** Seconds buffered ahead of position. */
  buffered: number;
  /** Whether playback is in the background (screen locked / app backgrounded). */
  inBackground: boolean;
  /** Error code/message when status === 'error'. */
  error?: string;
}

/** A single music track in a playlist. */
export interface Track {
  id: string;
  source: MediaSource;
  title?: string;
  artist?: string;
  album?: string;
  /** Artwork URL or local path shown on the lock screen. */
  artwork?: string;
  /** Track length in seconds, if known ahead of time. */
  duration?: number;
}

/** Resize behaviour for the <Video> surface. */
export type ResizeMode = 'contain' | 'cover' | 'stretch' | 'none';

/** A native playback event name. */
export type MediaEventType =
  | 'state'
  | 'progress'
  | 'buffering'
  | 'ended'
  | 'error'
  | 'remote-play'
  | 'remote-pause'
  | 'remote-next'
  | 'remote-previous'
  | 'remote-seek'
  | 'remote-duck';

/** Emitted by native players. `state` carries the full snapshot. */
export interface MediaEvent {
  type: MediaEventType;
  state?: PlaybackState;
  /** Generic payload for progress / remote events. */
  payload?: Record<string, unknown>;
}

/** Callback fired whenever the native player emits an event. */
export type MediaEventHandler = (event: MediaEvent) => void;

/** Remote control capabilities surfaced on the lock screen / headset. */
export interface RemoteControlOptions {
  /** Enable play/pause from lock screen & headsets. */
  enablePlayPause?: boolean;
  /** Enable next/previous track commands. */
  enableSkip?: boolean;
  /** Enable seek (scrubber) on the lock screen. */
  enableSeek?: boolean;
  /** Enable rating/like (no-op if unsupported). */
  enableLike?: boolean;
}

/** Metadata describing the currently active cast device (stub for now). */
export interface CastDevice {
  id: string;
  name: string;
  type: 'chromecast' | 'airplay' | 'unknown';
}

/** Options accepted by the <Video> component. */
export interface VideoProps {
  source: MediaSource;
  paused?: boolean;
  muted?: boolean;
  volume?: number;
  rate?: number;
  resizeMode?: ResizeMode;
  /** Auto-play once loaded. */
  autoPlay?: boolean;
  /** Loop the current source. */
  repeat?: boolean;
  /** Fired on every native event. */
  onEvent?: MediaEventHandler;
  /** Convenience: only state changes. */
  onStateChange?: (state: PlaybackState) => void;
  /** Convenience: progress ticks (throttled to ~4/sec). */
  onProgress?: (position: number, duration: number) => void;
  style?: object;
}

/** Options accepted by the <Audio> component (headless by default). */
export interface AudioProps {
  source: MediaSource;
  paused?: boolean;
  volume?: number;
  rate?: number;
  autoPlay?: boolean;
  loop?: boolean;
  onEvent?: MediaEventHandler;
}

/** Options accepted by the <MusicPlayer> component (headless by default). */
export interface MusicPlayerProps {
  tracks: Track[];
  autoPlay?: boolean;
  repeatMode?: RepeatMode;
  shuffle?: boolean;
  /** Lock-screen / remote control configuration. */
  remoteControls?: RemoteControlOptions;
  onEvent?: MediaEventHandler;
}
