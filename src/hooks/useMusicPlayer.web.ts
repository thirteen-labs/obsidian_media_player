import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_STATE } from '../utils/media';
import { WebSourceSlot } from '../utils/webFetch';
import {
  applyWebSessionMetadata,
  applyWebSessionPositionState,
  isWebSessionSupported,
} from '../utils/webSession';
import {
  buildOrder,
  createQueue,
  currentIndex,
  currentTrack,
  nextCursor,
  previousCursor,
  reshuffle,
  setRepeat,
  type QueueState,
} from '../core/PlaylistManager';
import type {
  MusicControls,
  PlaybackState,
  QueueSnapshot,
  RemoteControlOptions,
  RepeatMode,
  Track,
} from '../types';

/**
 * Web implementation of `useMusicPlayer`, backed by a single
 * `HTMLAudioElement`.
 *
 * This is a real player, not a stub: it drives shuffle, repeat, skip, seek and
 * next/previous off the element's own events, and reuses the same
 * `PlaylistManager` the native players use for the queue logic. The queue
 * semantics are therefore identical across platforms by construction rather
 * than by parallel maintenance.
 *
 * What it deliberately does *not* do, because the browser has no equivalent:
 * background audio, lock-screen / remote controls, and the offline cache.
 * `setBackgroundEnabled` and `setRemoteControls` are therefore no-ops rather
 * than errors — silently doing nothing is the correct behaviour for a
 * cross-platform prop, and throwing would break apps that set it
 * unconditionally.
 */
export function useMusicPlayer(initialTracks: Track[] = []): {
  state: PlaybackState;
  queue: QueueSnapshot;
  controls: MusicControls;
} {
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
  const [queue, setQueue] = useState<QueueSnapshot>({
    tracks: initialTracks,
    index: 0,
  });

  // Live mirrors so the stable `controls` object below can read current values
  // without being rebuilt on every progress tick. See to-be-done.md FG-1.3.
  const stateRef = useRef(state);
  stateRef.current = state;
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const elRef = useRef<HTMLAudioElement | null>(null);
  /**
   * Owns the object URL for the loaded track: revokes the previous one on every
   * change (a 50-track queue would otherwise leak 50 blobs) and discards
   * fetches that a later skip has already superseded. See to-be-done.md FG-2.2.
   */
  const slot = useRef<WebSourceSlot>(undefined as unknown as WebSourceSlot);
  if (!slot.current) slot.current = new WebSourceSlot();
  /** Queue logic, mirroring what the native side keeps on its player. */
  const qRef = useRef<QueueState>(createQueue(initialTracks, false, 'off'));
  /** Set while advancing automatically, so `ended` is not handled twice. */
  const advancingRef = useRef(false);
  const shouldPlayRef = useRef(false);

  const snapshot = useCallback((el: HTMLAudioElement): PlaybackState => {
    const duration = Number.isFinite(el.duration) ? el.duration : 0;
    let buffered = 0;
    try {
      if (el.buffered && el.buffered.length && duration > 0) {
        buffered = el.buffered.end(el.buffered.length - 1);
      }
    } catch {
      // Some browsers throw on `buffered` for a detached element.
    }
    return {
      ...stateRef.current,
      position: el.currentTime || 0,
      duration,
      rate: el.playbackRate || 1,
      muted: !!el.muted,
      volume: el.volume,
      buffered,
    };
  }, []);

  const publish = useCallback(
    (patch: Partial<PlaybackState>) => {
      setState((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  /** Loads the track at the queue's current cursor into the element. */
  const loadCurrent = useCallback(
    (autoplay: boolean) => {
      const el = elRef.current;
      if (!el) return;
      const track = currentTrack(qRef.current);
      if (!track) {
        // Nothing to load: free any blob the previous track was holding, or a
        // queue that is emptied and refilled leaks one per cycle.
        slot.current.release();
        publish({ status: 'idle', position: 0, duration: 0 });
        return;
      }
      const index = currentIndex(qRef.current);
      shouldPlayRef.current = autoplay;
      // Emitted before the await and never after. A superseded call bails out
      // below without publishing, so a stale 'loading' can never overwrite the
      // winner's final status: a call that emits *after* another call's
      // resolution is by definition the newer one, and the older one is stale.
      publish({ status: 'loading', position: 0, duration: 0, error: undefined });

      void slot.current.load(track.source).then((result) => {
        // The user skipped on while this was fetching. The slot has already
        // revoked the blob this call created.
        if (result.kind === 'stale') return;
        if (result.kind === 'error') {
          publish({ status: 'error', error: result.message });
          return;
        }
        el.src = result.url;
        el.currentTime = 0;
        setQueue((prev) => ({ ...prev, index }));
        publish({ status: autoplay ? 'playing' : 'ready', duration: 0 });
        if (autoplay) {
          // Autoplay policies reject this if the user has not interacted with
          // the page. The rejection is expected and handled by `error`.
          void el.play().catch(() => publish({ status: 'paused' }));
        }
      });
    },
    [publish]
  );

  // Create the element once, wire its events, tear it down on unmount.
  useEffect(() => {
    const Ctor = (globalThis as any).Audio;
    if (typeof Ctor !== 'function') {
      publish({ status: 'error', error: 'HTMLAudioElement is not available' });
      return;
    }
    const el: HTMLAudioElement = new Ctor();
    el.preload = 'metadata';
    elRef.current = el;

    const onTimeUpdate = () => publish(snapshot(el));
    const onDuration = () => publish({ duration: snapshot(el).duration });
    const onPlay = () => publish({ status: 'playing' });
    const onPause = () =>
      publish({ status: el.ended ? 'ended' : 'paused' });
    const onWaiting = () => publish({ status: 'buffering' });
    const onPlaying = () => publish({ status: 'playing' });
    const onError = () => {
      const mediaError = el.error;
      publish({
        status: 'error',
        // `MEDIA_ERR_SRC_NOT_SUPPORTED` (4) is the common case here and is
        // almost always a 404 or a CORS rejection, so say so rather than
        // surfacing a bare "MEDIA_ELEMENT_ERROR: 4".
        error:
          mediaError?.message ||
          (mediaError?.code === 4
            ? 'Media could not be loaded (unsupported source, 404, or blocked by CORS)'
            : 'Playback failed'),
      });
    };
    const onEnded = () => {
      if (advancingRef.current) return;
      const { cursor, stop } = nextCursor(qRef.current);
      if (stop) {
        shouldPlayRef.current = false;
        publish({ status: 'ended', position: snapshot(el).duration });
        return;
      }
      advancingRef.current = true;
      qRef.current = { ...qRef.current, cursor };
      loadCurrent(true);
      advancingRef.current = false;
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('loadedmetadata', onDuration);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('error', onError);
    el.addEventListener('ended', onEnded);

    if (qRef.current.tracks.length) loadCurrent(false);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('durationchange', onDuration);
      el.removeEventListener('loadedmetadata', onDuration);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('error', onError);
      el.removeEventListener('ended', onEnded);
      el.pause();
      // Free the header-auth blob, if this track had one. Without this the
      // object URL outlives the component.
      slot.current.release();
      // Clear the now-playing metadata so the OS session does not keep showing a
      // track from a player that is gone. Only the metadata: the action handlers
      // belong to `useRemoteControls.web`, and `clearWebSession()` would take
      // those down with it.
      applyWebSessionMetadata(null);
      // Release the decoded media rather than leaving the element buffering.
      el.removeAttribute('src');
      el.load();
      elRef.current = null;
    };
    // Mount-only: the element and its listeners live for the hook's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Publish the now-playing track to the OS media session. This is the only
  // place `Track.artwork` has a consumer on any platform — on native it is
  // decoded and discarded (to-be-done.md FG-6.4). See FG-2.3.
  const activeTrack = currentTrack(qRef.current);
  const activeId = activeTrack?.id ?? null;
  useEffect(() => {
    if (!isWebSessionSupported()) return;
    // Read through the queue ref rather than depending on the track object: a
    // caller rebuilding `tracks` inline would re-publish metadata every render.
    applyWebSessionMetadata(activeId ? currentTrack(qRef.current) : null);
  }, [activeId]);

  // Publish the scrubber position. Every emission would be wasteful — position
  // moves several times a second — but it is cheap and `setPositionState`
  // ignores unusable values, so the clamping lives in `webSession`.
  useEffect(() => {
    if (!isWebSessionSupported()) return;
    applyWebSessionPositionState({
      duration: state.duration,
      position: state.position,
      rate: state.rate,
    });
  }, [state.duration, state.position, state.rate]);

  const controls = useRef<MusicControls>({
    // Resolves synchronously on web, but returns a promise because the shared
    // `MusicControls` type says so: the native hook awaits a cache lookup per
    // track before handing the queue to the player. There is no equivalent
    // lookup here — `DownloadManager.resolveUri` returns null when there is no
    // native cache, so the web path has nothing to await. Returning
    // `Promise.resolve()` keeps consumer code written against the shared type
    // working (`await controls.setQueue(...)`) without pretending to do work
    // it does not do. See to-be-done.md FG-5.1.
    setQueue: async (tracks) => {
      qRef.current = createQueue(tracks, qRef.current.shuffle, qRef.current.repeat);
      // The real index, not a literal 0: `createQueue` starts the cursor at 0,
      // but `order[0]` is not track 0 once shuffle is on.
      setQueue({ tracks, index: currentIndex(qRef.current) });
      loadCurrent(shouldPlayRef.current);
    },
    addTracks: (tracks) => {
      const q = qRef.current;
      const merged = [...q.tracks, ...tracks];
      // The new tracks must also enter `order`. Appending to `tracks` alone
      // leaves them unreachable: `currentTrack` reads through `order[cursor]`,
      // so a track missing from `order` can never be played or skipped to.
      const added = tracks.map((_, i) => q.tracks.length + i);
      qRef.current = { ...q, tracks: merged, order: [...q.order, ...added] };
      setQueue((prev) => ({ ...prev, tracks: merged }));
    },
    removeTrack: (id) => {
      const q = qRef.current;
      const trackPos = q.tracks.findIndex((t) => t.id === id);
      if (trackPos < 0) return;
      const wasActive = currentIndex(q) === trackPos;
      // Filtering `tracks` renumbers every later track, so `order` has to be
      // renumbered with it. Dropping the entry and shifting the ones above it
      // down is what keeps `order[cursor]` pointing at the same *track*.
      const order = q.order
        .filter((t) => t !== trackPos)
        .map((t) => (t > trackPos ? t - 1 : t));
      const removedAt = q.order.indexOf(trackPos);
      let cursor: number;
      if (wasActive) {
        // Continue from the slot the track occupied — it now holds the following
        // track — clamped to the end when the last one was removed.
        cursor = Math.min(q.cursor, Math.max(order.length - 1, 0));
      } else {
        // An entry before the cursor was deleted, so the cursor shifted left.
        cursor = removedAt >= 0 && removedAt < q.cursor ? q.cursor - 1 : q.cursor;
      }
      const remaining = q.tracks.filter((t) => t.id !== id);
      qRef.current = { ...q, tracks: remaining, order, cursor };
      setQueue({ tracks: remaining, index: currentIndex(qRef.current) });
      // Only reload when the removed track was the one loaded. Reloading
      // unconditionally restarts the current song on every removal.
      if (wasActive) loadCurrent(shouldPlayRef.current);
    },
    skipTo: (index) => {
      const q = qRef.current;
      // `QueueSnapshot.index` is a *track* index (`currentIndex`), so callers
      // pass a track index. Map it back to a cursor through `order` — treating
      // it as a cursor directly plays the wrong track whenever shuffle is on,
      // since `order` is a permutation.
      const cursor = q.order.indexOf(index);
      if (cursor < 0) return;
      qRef.current = { ...q, cursor };
      loadCurrent(true);
    },
    next: () => {
      const { cursor, stop } = nextCursor(qRef.current);
      if (stop) {
        shouldPlayRef.current = false;
        publish({ status: 'ended' });
        elRef.current?.pause();
        return;
      }
      qRef.current = { ...qRef.current, cursor };
      loadCurrent(true);
    },
    previous: () => {
      // Match the native players: restart the track if we are more than a few
      // seconds in, otherwise step back. This is the behaviour listeners expect
      // from a hardware "previous" button.
      const el = elRef.current;
      if (el && el.currentTime > 3) {
        el.currentTime = 0;
        publish({ position: 0 });
        return;
      }
      qRef.current = { ...qRef.current, cursor: previousCursor(qRef.current) };
      loadCurrent(true);
    },
    play: () => {
      shouldPlayRef.current = true;
      const el = elRef.current;
      if (!el) return;
      if (!el.src) {
        loadCurrent(true);
        return;
      }
      // Published optimistically. A real element fires `play`/`playing` and will
      // refine this, but when the browser's autoplay policy rejects the promise
      // *no event ever arrives* — without this the UI would sit on 'ready' after
      // a play the user asked for and the browser refused.
      publish({ status: 'playing' });
      void el.play().catch(() => publish({ status: 'paused' }));
    },
    pause: () => {
      shouldPlayRef.current = false;
      const el = elRef.current;
      if (!el) return;
      el.pause();
      // Published here rather than left to the element's `pause` event: that
      // event arrives a frame later, and not at all if the element was never
      // playing, which would strand the UI on a stale 'playing' status.
      if (!el.ended) publish({ status: 'paused' });
    },
    stop: () => {
      shouldPlayRef.current = false;
      const el = elRef.current;
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
      publish({ status: 'idle', position: 0 });
    },
    seek: (seconds) => {
      const el = elRef.current;
      if (!el) return;
      const duration = Number.isFinite(el.duration) ? el.duration : 0;
      const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
      el.currentTime = target;
      publish({ position: target });
    },
    setRate: (rate) => {
      if (elRef.current) elRef.current.playbackRate = rate;
      publish({ rate });
    },
    setVolume: (volume) => {
      if (elRef.current) elRef.current.volume = volume;
      publish({ volume });
    },
    setMuted: (muted) => {
      if (elRef.current) elRef.current.muted = muted;
      publish({ muted });
    },
    setRepeatMode: (mode: RepeatMode) => {
      qRef.current = setRepeat(qRef.current, mode);
    },
    setShuffle: (shuffle) => {
      const q = qRef.current;
      if (shuffle === q.shuffle) return;
      // Keep the active track loaded across the toggle, so `queue.index` and the
      // element never disagree about what is playing. `reshuffle` does this for
      // the shuffle-on direction; unshuffling needs the same guarantee done by
      // hand, because `buildOrder` ignores `preserveCurrent` when not shuffling.
      const active = currentIndex(q);
      const order = shuffle ? reshuffle(q).order : buildOrder(q.tracks.length, false);
      if (!shuffle && order[0] !== active) {
        const pos = order.indexOf(active);
        if (pos > 0) {
          order[0] = active;
          order[pos] = 0;
        }
      }
      qRef.current = { ...q, order, cursor: 0, shuffle };
      setQueue((prev) => ({ ...prev, index: active }));
    },
    // No-ops: see the module comment. The browser has no background audio
    // session and no lock-screen control surface, and throwing here would
    // break apps that set these props unconditionally for iOS/Android.
    setRemoteControls: (_options: RemoteControlOptions) => undefined,
    setBackgroundEnabled: (_enabled: boolean) => undefined,
    getQueue: async () => queueRef.current,
    getState: async () => stateRef.current,
  });

  return { state, queue, controls: controls.current };
}
