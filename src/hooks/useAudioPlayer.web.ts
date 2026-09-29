import { useEffect, useRef, useState } from 'react';
import { INITIAL_STATE } from '../utils/media';
import { WebSourceSlot } from '../utils/webFetch';
import type { AudioControls, MediaSource, PlaybackState } from '../types';

/**
 * Web implementation of `useAudioPlayer`, backed by a single
 * `HTMLAudioElement`.
 *
 * Mirrors `hooks/useAudioPlayer.ts`'s surface exactly so `<Audio>` and its
 * consumers need no platform branch. The native hook was never web-safe: it
 * imports `NativeEventEmitter`, which react-native-web does not provide, and
 * `src/index.ts` re-exports it unconditionally.
 */
export function useAudioPlayer(initial?: MediaSource): {
  state: PlaybackState;
  controls: AudioControls;
} {
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const elRef = useRef<HTMLAudioElement | null>(null);
  /**
   * Owns the object URL for the loaded source, so repeated `load()` calls revoke
   * their predecessor and a superseded fetch cannot overwrite a newer one. See
   * to-be-done.md FG-2.2.
   */
  const slot = useRef<WebSourceSlot>(undefined as unknown as WebSourceSlot);
  if (!slot.current) slot.current = new WebSourceSlot();

  useEffect(() => {
    const Ctor = (globalThis as any).Audio;
    if (typeof Ctor !== 'function') {
      setState((prev) => ({ ...prev, status: 'error', error: 'HTMLAudioElement is not available' }));
      return;
    }
    const el: HTMLAudioElement = new Ctor();
    el.preload = 'metadata';
    elRef.current = el;

    const snapshot = (): PlaybackState => {
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
    };

    const onTimeUpdate = () => setState(snapshot());
    const onDuration = () => setState(snapshot());
    const onPlay = () => setState((p) => ({ ...p, status: 'playing' }));
    const onPause = () => setState((p) => ({ ...p, status: el.ended ? 'ended' : 'paused' }));
    const onWaiting = () => setState((p) => ({ ...p, status: 'buffering' }));
    const onPlaying = () => setState((p) => ({ ...p, status: 'playing' }));
    const onError = () =>
      setState((p) => ({
        ...p,
        status: 'error',
        error:
          el.error?.message ||
          (el.error?.code === 4
            ? 'Media could not be loaded (unsupported source, 404, or blocked by CORS)'
            : 'Playback failed'),
      }));

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('loadedmetadata', onDuration);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('error', onError);

    // The initial source is resolved through the slot too, so a header-auth
    // source is fetched the same way as one passed to `load()` later.
    if (initial?.uri) {
      void slot.current.load(initial).then((result) => {
        // The element may already be gone if the hook unmounted mid-fetch; the
        // slot has revoked the blob either way.
        if (result.kind === 'stale' || !elRef.current) return;
        if (result.kind === 'error') {
          setState((p) => ({ ...p, status: 'error', error: result.message }));
          return;
        }
        elRef.current.src = result.url;
      });
    }

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('durationchange', onDuration);
      el.removeEventListener('loadedmetadata', onDuration);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('error', onError);
      el.pause();
      // Free the header-auth blob, if this source had one.
      slot.current.release();
      el.removeAttribute('src');
      el.load();
      elRef.current = null;
    };
    // Mount-only: the element and its listeners live for the hook's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const controls = useRef<AudioControls>({
    // Returns the promise rather than firing it: `AudioControls.load` is typed
    // `Promise<void>` because the load is genuinely async (a header-auth source
    // has to be fetched into a blob first), and a consumer awaiting `load()` to
    // know the source is attached would otherwise await nothing at all.
    load: (source) => {
      const el = elRef.current;
      if (!el) return Promise.resolve();
      setState((p) => ({ ...p, status: 'loading', position: 0, error: undefined }));
      return slot.current.load(source).then((result) => {
        if (result.kind === 'stale' || !elRef.current) return;
        if (result.kind === 'error') {
          // Loud, per FG-2.2: assigning a URL that 401s leaves a silent element
          // that never fires `error`.
          setState((p) => ({ ...p, status: 'error', error: result.message }));
          return;
        }
        elRef.current.src = result.url;
        elRef.current.currentTime = 0;
      });
    },
    play: () => { void elRef.current?.play().catch(() => undefined); },
    pause: () => {
      const el = elRef.current;
      if (!el) return;
      el.pause();
      if (!el.ended) setState((p) => ({ ...p, status: 'paused' }));
    },
    stop: () => {
      const el = elRef.current;
      if (!el) return;
      el.pause();
      el.currentTime = 0;
      setState((p) => ({ ...p, status: 'idle', position: 0 }));
    },
    seek: (seconds) => {
      const el = elRef.current;
      if (!el) return;
      const duration = Number.isFinite(el.duration) ? el.duration : 0;
      const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
      el.currentTime = target;
      setState((p) => ({ ...p, position: target }));
    },
    setRate: (rate) => {
      if (elRef.current) elRef.current.playbackRate = rate;
      setState((p) => ({ ...p, rate }));
    },
    setVolume: (volume) => {
      if (elRef.current) elRef.current.volume = volume;
      setState((p) => ({ ...p, volume }));
    },
    setMuted: (muted) => {
      if (elRef.current) elRef.current.muted = muted;
      setState((p) => ({ ...p, muted }));
    },
    setLoop: (loop) => { if (elRef.current) elRef.current.loop = loop; },
    getState: async () => stateRef.current,
  });

  return { state, controls: controls.current };
}
