import { useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { DownloadManager } from '../core/DownloadManager';
import MusicPlayerNative from '../native/MusicPlayerNative';
import { MUSIC_EVENTS } from '../core/Events';
import { INITIAL_STATE, parseState, tracksToJson } from '../utils/media';
import type {
  MusicControls,
  PlaybackState,
  QueueSnapshot,
  Track,
} from '../types';

// Re-exported so existing `from './hooks/useMusicPlayer'` imports keep working.
// The definitions live in `types.ts` so the web build can share them — see
// to-be-done.md FG-2.1.
export type { MusicControls, QueueSnapshot };

export function useMusicPlayer(initialTracks: Track[] = []): {
  state: PlaybackState;
  queue: QueueSnapshot;
  controls: MusicControls;
} {
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
  const [queue, setQueueState] = useState<QueueSnapshot>({
    tracks: initialTracks,
    index: 0,
  });

  useEffect(() => {
    const emitter = new NativeEventEmitter(MusicPlayerNative as any);

    const onState = (e: any) => {
      const parsed = parseState(e?.stateJson);
      if (parsed) setState(parsed);
    };
    const onProgress = (e: any) =>
      setState((prev) => ({
        ...prev,
        position: e?.position ?? prev.position,
        duration: e?.duration ?? prev.duration,
      }));
    const onTrackChange = (e: any) =>
      setQueueState((prev) => ({ ...prev, index: e?.index ?? prev.index }));
    const onQueueChange = (e: any) =>
      setQueueState((prev) => ({
        ...prev,
        tracks: e?.tracks ?? prev.tracks,
        index: e?.index ?? prev.index,
      }));
    // Both platforms emit these (Android `ObsidianMusicPlayerModule.kt:153`,
    // iOS `:125`) and both were unsubscribed, so a finished queue was
    // indistinguishable from a pause and a player error was silent.
    const onEnded = () =>
      setState((prev) => ({ ...prev, status: 'ended', position: prev.duration }));
    const onError = (e: any) =>
      setState((prev) => ({ ...prev, status: 'error', error: e?.message }));

    // Single source of truth for which events this hook handles. Keeps the
    // handler mapping and the event list from drifting apart, and is what
    // previously hid two unsubscribed events (`onEnded`, `onError`) behind a
    // hardcoded listener count. See to-be-done.md FG-1.4.
    const subscriptions: Array<[string, (e: any) => void]> = [
      [MUSIC_EVENTS.STATE, onState],
      [MUSIC_EVENTS.PROGRESS, onProgress],
      [MUSIC_EVENTS.TRACK_CHANGE, onTrackChange],
      [MUSIC_EVENTS.QUEUE_CHANGE, onQueueChange],
      [MUSIC_EVENTS.ENDED, onEnded],
      [MUSIC_EVENTS.ERROR, onError],
    ];

    // No manual `addListener` / `removeListeners` bookkeeping: because the
    // emitter was constructed *with* the native module, `NativeEventEmitter`
    // already forwards both for us (`NativeEventEmitter.js:80,90`). Calling
    // them by hand as well double-counted every subscription — 12 adds and 7
    // removes for 6 listeners — which misreports listener counts to the native
    // side on both platforms.
    const subs = subscriptions.map(([name, handler]) =>
      emitter.addListener(name, handler)
    );

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, []);

  const controls = useRef<MusicControls>({
    setQueue: async (tracks) => {
      // Resolve each track's URI to a local cached copy if available, so the
      // native player can play offline content.
      const resolvedTracks = await Promise.all(
        tracks.map(async (track) => {
          // `cacheable: false` is the existing opt-out. to-be-done.md FG-5.1
          // step 6 proposed adding a second `preferCache` flag, which would have
          // duplicated it: the flag is already in the public `MediaSource` type
          // and already threaded to both players
          // (`buildDataSourceFactory(context, cacheable)` on Android,
          // `ObsidianVideoPlayer.load(_:headers:cacheable:)` on iOS). It just
          // was not honoured *here*, so a source the player was told not to cache
          // would still be rewritten to a local copy.
          const cachedUri =
            track.source.cacheable === false
              ? null
              : await DownloadManager.resolveUri(track.id);
          return {
            ...track,
            source: { ...track.source, uri: cachedUri || track.source.uri },
          };
        })
      );
      setQueueState((prev) => ({ ...prev, tracks: resolvedTracks }));
      MusicPlayerNative.setQueue(tracksToJson(resolvedTracks));
    },
    addTracks: (tracks) => MusicPlayerNative.addTracks(tracksToJson(tracks)),
    removeTrack: (id) => MusicPlayerNative.removeTrack(id),
    skipTo: (index) => MusicPlayerNative.skipTo(index),
    next: () => MusicPlayerNative.next(),
    previous: () => MusicPlayerNative.previous(),
    play: () => MusicPlayerNative.play(),
    pause: () => MusicPlayerNative.pause(),
    stop: () => MusicPlayerNative.stop(),
    seek: (seconds) => MusicPlayerNative.seek(seconds),
    setRate: (rate) => MusicPlayerNative.setRate(rate),
    setVolume: (volume) => MusicPlayerNative.setVolume(volume),
    setMuted: (muted) => MusicPlayerNative.setMuted(muted),
    setRepeatMode: (mode) => MusicPlayerNative.setRepeatMode(mode),
    setShuffle: (shuffle) => MusicPlayerNative.setShuffle(shuffle),
    setRemoteControls: (options) =>
      MusicPlayerNative.setRemoteControls(JSON.stringify(options)),
    setBackgroundEnabled: (enabled) =>
      MusicPlayerNative.setBackgroundEnabled(enabled),
    getQueue: async () => {
      const raw = await MusicPlayerNative.getCurrentQueue();
      try {
        return JSON.parse(raw) as QueueSnapshot;
      } catch {
        return null;
      }
    },
    getState: async () => parseState(await MusicPlayerNative.getCurrentState()),
  });

  useEffect(() => {
    if (initialTracks.length) {
      MusicPlayerNative.setQueue(tracksToJson(initialTracks));
    }
    return () => {
      MusicPlayerNative.setBackgroundEnabled(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, queue, controls: controls.current };
}
