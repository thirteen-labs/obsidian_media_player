import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { INITIAL_STATE } from '../utils/media';
import { WebSourceSlot } from '../utils/webFetch';
import type { AudioProps, PlaybackState } from '../types';

export interface AudioHandle {
  load: (s: { uri: string }) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (s: number) => void;
  setRate: (r: number) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setLoop: (l: boolean) => void;
  getState: () => PlaybackState;
  getCurrentState: () => Promise<PlaybackState | null>;
}

/**
 * Pure-web Audio — HTMLAudioElement. Metro picks this file for `*.web.tsx`.
 *
 * Note: the source is resolved imperatively rather than passed to the `Audio`
 * constructor, because a source that authenticates via request headers has to
 * be fetched before there is a URL to give the element. See to-be-done.md
 * FG-2.2.
 */
export const Audio = forwardRef<AudioHandle, AudioProps>(function AudioWeb(
  { source, paused = false, volume = 1, rate = 1, autoPlay = false, loop = false, onEvent },
  ref
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const slot = useRef<WebSourceSlot>(undefined as unknown as WebSourceSlot);
  if (!slot.current) slot.current = new WebSourceSlot();

  const emit = useCallback(
    (next: Partial<PlaybackState> & { status?: PlaybackState['status'] }) => {
      setState((prev) => {
        const merged = { ...prev, ...next } as PlaybackState;
        onEvent?.({ type: 'state', state: merged });
        return merged;
      });
    },
    [onEvent]
  );

  // Read through a ref so the source effect below depends only on `sourceKey`.
  // `source` and `emit` get fresh identities every render, and depending on
  // either would re-resolve the source on every render.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const emitRef = useRef(emit);
  emitRef.current = emit;

  const sourceKey = `${source.uri}|${source.type ?? ''}|${JSON.stringify(source.headers ?? null)}`;

  useImperativeHandle(ref, (): AudioHandle => ({
    load: s => {
      const el = audioRef.current;
      if (!el) return;
      emitRef.current({ status: 'loading', position: 0, error: undefined });
      void slot.current.load(s).then((result) => {
        if (result.kind === 'stale' || !audioRef.current) return;
        if (result.kind === 'error') {
          emitRef.current({ status: 'error', error: result.message });
          return;
        }
        audioRef.current.src = result.url;
        audioRef.current.currentTime = 0;
      });
    },
    play: () => void audioRef.current?.play(),
    pause: () => audioRef.current?.pause(),
    stop: () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } },
    seek: s => { if (audioRef.current) audioRef.current.currentTime = s; },
    setRate: r => { if (audioRef.current) audioRef.current.playbackRate = r; stateRef.current.rate = r; },
    setVolume: v => { if (audioRef.current) audioRef.current.volume = v; stateRef.current.volume = v; },
    setMuted: m => { if (audioRef.current) audioRef.current.muted = m; stateRef.current.muted = m; },
    setLoop: l => { if (audioRef.current) audioRef.current.loop = l; },
    getState: () => stateRef.current,
    getCurrentState: async () => stateRef.current,
  }), []);

  // Create the element once, wire its events, tear it down on unmount.
  useEffect(() => {
    const Ctor = (globalThis as any).Audio;
    if (typeof Ctor !== 'function') {
      emitRef.current({ status: 'error', error: 'HTMLAudioElement is not available' });
      return;
    }
    const el: HTMLAudioElement = new Ctor();
    el.preload = 'metadata';
    el.volume = volume;
    el.playbackRate = rate;
    el.loop = loop;
    el.muted = false;
    audioRef.current = el;

    // These were missing entirely, so `status` never left `idle` and `onEvent`
    // was never called on web. Found while implementing FG-2.2, which needed
    // somewhere to report a failed header-auth fetch.
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
    const onTimeUpdate = () => emitRef.current(snapshot());
    const onDuration = () => emitRef.current({ duration: snapshot().duration });
    const onPlay = () => emitRef.current({ status: 'playing' });
    const onPause = () => emitRef.current({ status: el.ended ? 'ended' : 'paused' });
    const onWaiting = () => emitRef.current({ status: 'buffering' });
    const onPlaying = () => emitRef.current({ status: 'playing' });
    const onEnded = () => emitRef.current({ status: 'ended' });
    const onError = () =>
      emitRef.current({
        status: 'error',
        error:
          el.error?.message ||
          (el.error?.code === 4
            ? 'Media could not be loaded (unsupported source, 404, or blocked by CORS)'
            : 'Playback failed'),
      });

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('loadedmetadata', onDuration);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);

    if (paused) el.pause();
    if (autoPlay && !paused) void el.play().catch(() => undefined);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('durationchange', onDuration);
      el.removeEventListener('loadedmetadata', onDuration);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
      el.pause();
      // Free the header-auth blob, if this source had one. Without this the
      // object URL outlives the component.
      slot.current.release();
      el.removeAttribute('src');
      el.load();
      audioRef.current = null;
    };
    // Mount-only: the element and its listeners live for the component's
    // lifetime. Volume/rate/loop/paused are re-applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the initial source, and re-resolve whenever it actually changes.
  useEffect(() => {
    if (!audioRef.current) return;
    let cancelled = false;
    void slot.current.load(sourceRef.current).then((result) => {
      if (cancelled || result.kind === 'stale' || !audioRef.current) return;
      if (result.kind === 'error') {
        emitRef.current({ status: 'error', error: result.message });
        return;
      }
      audioRef.current.src = result.url;
      audioRef.current.currentTime = 0;
    });
    return () => {
      cancelled = true;
    };
  }, [sourceKey]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate]);
  useEffect(() => { if (audioRef.current) audioRef.current.loop = loop; }, [loop]);
  useEffect(() => {
    if (!audioRef.current) return;
    if (paused) audioRef.current.pause();
    else if (autoPlay) void audioRef.current.play().catch(() => undefined);
  }, [paused, autoPlay]);

  return null;
});
