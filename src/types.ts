/**
 * Public type definitions for obsidian-media-player.
 *
 * These types describe the cross-platform contract shared by the <Video>,
 * <Audio> and <MusicPlayer> APIs. The native layers (iOS / Android) emit and
 * consume values that map directly onto these structures.
 */

/**
 * Hint used by the native player to pick the right demuxer. Omit to
 * auto-detect.
 *
 * Note: `'smooth'` (Smooth Streaming) was removed in 0.3.0. It was never
 * implemented — both platforms silently fell back to progressive playback,
 * which fails on real Smooth Streaming content. Omit `type` for progressive
 * files. See to-be-done.md FG-0.4a.
 */
export type MediaSourceType = 'file' | 'hls' | 'dash' | 'progressive';

/** A playable media source. */
export interface MediaSource {
  /** Remote URL or local file path. */
  uri: string;
  /** Hint used by the native player to pick the right demuxer. Omit to auto-detect. */
  type?: MediaSourceType;
  /** Optional HTTP headers sent when fetching the resource. */
  headers?: Record<string, string>;
  /**
   * Whether this source may be cached on disk. Defaults to true.
   *
   * `false` is the opt-out for offline playback, honoured in **all three**
   * places: the native data-source factory
   * (`buildDataSourceFactory(context, cacheable)` on Android,
   * `ObsidianVideoPlayer.load(_:headers:cacheable:)` on iOS) and the JS
   * download lookup, which skips resolving a local copy. The JS half was
   * missing, so a source the player had been told not to cache could still be
   * rewritten to a local file. See to-be-done.md FG-5.1 step 6 — this flag is
   * deliberately the *only* one; a second `preferCache` spelling was proposed
   * and rejected as duplicative.
   */
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

/**
 * Imperative handle exposed by `<Video>` via `ref`, on every platform.
 *
 * Declared here rather than in `components/Video.tsx` because the web build
 * (`Video.web.tsx`) previously kept its own copy of this interface. The two
 * silently drifted: `flush` was added natively and the web copy never got it,
 * so `useVideoPlayer().controls.flush()` type-checked but threw on web.
 * See to-be-done.md FG-1.5.
 */
export interface VideoHandle {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setResizeMode: (mode: string) => void;
  /**
   * Most recent native state snapshot. Always live — reading it right after a
   * `seek()` may still predate the seek, since the update crosses the bridge
   * asynchronously. Await `flush()` when you need the value to have landed.
   */
  getState: () => PlaybackState;
  /**
   * Resolves with the state once the next native emission has been applied.
   *
   * Gives `getState()` a way to be awaited, which is otherwise impossible
   * because it is synchronous. Falls back to resolving with the current state
   * after `timeoutMs` (default 1000) so it cannot hang on an idle, paused or
   * ended player, which emit no state changes.
   */
  flush: (timeoutMs?: number) => Promise<PlaybackState>;
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

/**
 * Imperative surface shared by `useAudioPlayer` on every platform.
 *
 * Lives here for the same reason as `MusicControls`: the web build needs an
 * identical shape, and a private copy per platform drifts.
 */
export interface AudioControls {
  /**
   * Loads a source, preferring a cached copy when one has been downloaded.
   *
   * `Promise<void>` rather than `void`: the implementation awaits a cache
   * lookup first, so declaring it synchronous meant consumers could not know
   * when the load had happened — and the declared type is what the FG-5.1
   * regression tests tripped over.
   */
  load: (source: MediaSource) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setLoop: (loop: boolean) => void;
  getState: () => Promise<PlaybackState | null>;
}

/**
 * A command that arrived from outside the app — lock screen, headset button,
 * car stereo, or (on web) the OS media session.
 *
 * Declared here rather than in `hooks/useRemoteControls.ts` so the web
 * implementation emits exactly the same set. The native and web versions were
 * separate copies, which is how the web one drifted into being a no-op that
 * still had to keep the type alive. See to-be-done.md FG-2.3.
 */
export type RemoteCommand =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'seek'
  | 'stop'
  | 'duck';

export interface QueueSnapshot {
  tracks: Track[];
  index: number;
}

/**
 * One entry in the offline download list.
 *
 * Lives here rather than in `core/DownloadManager.ts` because both the native
 * `ObsidianCache` path and the web `CacheStorage` path produce it. See
 * to-be-done.md FG-2.4.
 */
export interface DownloadInfo {
  id: string;
  uri: string;
  /**
   * A directly playable `file:` URL for the downloaded copy, when the platform
   * has one.
   *
   * Replaces an earlier `localExtension` field, which nothing ever wrote and
   * which could not have been useful anyway: an extension does not make a path,
   * and JS has no way to know the app's cache directory. The resolved URL is
   * what a caller can actually hand to a player.
   *
   * **iOS only.** `ObsidianCacheModule` writes each download to
   * `<cacheDir>/obsidian-media-cache/<id>.<ext>` and records that path here.
   * Android has no equivalent and does not need one: `SimpleCache` maps cache
   * *keys* to spans and `CacheDataSource` serves them, so on Android requesting
   * the source URL *is* how a cached file is played. Absent on web — a
   * `CacheStorage` entry is opaque to a media element.
   *
   * Only present while `status === 'done'` **and** the file still exists; the
   * platform drops it otherwise, so a stale path is never handed back.
   */
  localUri?: string;
  /** Bytes downloaded so far. Increments as the download progresses. */
  bytesDownloaded: number;
  /** Total bytes expected for the download. Used for progress percentage. */
  bytesTotal: number;
  /**
   * `'downloading'` is only ever reported by the native modules, which download
   * incrementally. The web path is atomic — the entry exists only once the whole
   * body is stored — and reports a failure by rejecting `download()` rather than
   * by leaving an `'error'` record, so it only ever reports `'done'`.
   */
  status: 'downloading' | 'done' | 'error' | 'paused';
}

/**
 * Imperative surface shared by `useMusicPlayer` on every platform.
 *
 * Declared here rather than in `hooks/useMusicPlayer.ts` because the web build
 * (`hooks/useMusicPlayer.web.ts`) must expose the *identical* shape for
 * `MediaProvider` and `MusicPlayer.web.tsx` to need no platform branch. The
 * native hook re-exports it, so existing imports keep working.
 */
export interface MusicControls {
  /**
   * Replaces the queue, preferring cached copies of downloaded tracks.
   *
   * `Promise<void>` rather than `void` — the implementation awaits a cache
   * lookup per track before handing the queue to the native player. Awaiting it
   * is the only way to know the queue has actually been set.
   */
  setQueue: (tracks: Track[]) => Promise<void>;
  addTracks: (tracks: Track[]) => void;
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
  setRepeatMode: (mode: RepeatMode) => void;
  setShuffle: (shuffle: boolean) => void;
  setRemoteControls: (options: RemoteControlOptions) => void;
  setBackgroundEnabled: (enabled: boolean) => void;
  getQueue: () => Promise<QueueSnapshot | null>;
  getState: () => Promise<PlaybackState | null>;
}

/**
 * Imperative surface of the `<MusicPlayer>` component ref.
 *
 * Same reason as `VideoHandle`: declared once so the native and web components
 * cannot drift. Unlike `MusicControls`, the two getters are synchronous here
 * because a component ref has no reason to be async.
 */
export interface MusicPlayerHandle
  extends Omit<MusicControls, 'getState' | 'getQueue'> {
  getState: () => PlaybackState;
  getQueue: () => QueueSnapshot;
}
