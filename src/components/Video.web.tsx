import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { INITIAL_STATE } from '../utils/media';
import { WebSourceSlot } from '../utils/webFetch';
import type { PlaybackState, VideoHandle, VideoProps } from '../types';

export type { VideoHandle };

/**
 * Web fallback for <Video>. Uses a plain HTML5 <video> element so the same
 * JSX works on react-native-web / Next.js. Props map 1:1 to the native
 * component; events are normalized to the same PlaybackState shape.
 */
export const Video = forwardRef<VideoHandle, VideoProps>(function VideoWeb(
  { source, paused = false, muted = false, volume = 1, rate = 1, resizeMode = 'contain', autoPlay = false, repeat = false, onEvent, onStateChange, onProgress, style },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);

  // Live mirror + pending flushes: identical contract to the native build, so
  // `getState()` is not a stale closure and `flush()` exists here too. It used
  // to be absent entirely because this file had its own `VideoHandle` copy.
  const stateRef = useRef(state);
  stateRef.current = state;
  const pendingFlushes = useRef<
    Array<{ resolve: (s: PlaybackState) => void; timer: ReturnType<typeof setTimeout> }>
  >([]);

  const settleFlushes = useCallback((next: PlaybackState) => {
    const pending = pendingFlushes.current;
    pendingFlushes.current = [];
    pending.forEach((p) => {
      clearTimeout(p.timer);
      p.resolve(next);
    });
  }, []);

  const flush = useCallback(
    (timeoutMs = 1000) =>
      new Promise<PlaybackState>((resolve) => {
        const timer = setTimeout(() => resolve(stateRef.current), timeoutMs);
        pendingFlushes.current.push({ resolve, timer });
      }),
    []
  );

  useEffect(
    () => () => {
      pendingFlushes.current.forEach((p) => clearTimeout(p.timer));
      pendingFlushes.current = [];
    },
    []
  );

  const emit = (next: Partial<PlaybackState> & { status?: PlaybackState['status'] }) => {
    setState(prev => {
      const merged = { ...prev, ...next } as PlaybackState;
      onStateChange?.(merged);
      onEvent?.({ type: 'state', state: merged });
      settleFlushes(merged);
      return merged;
    });
  };

  useImperativeHandle(ref, (): VideoHandle => ({
    play: () => void videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
    stop: () => { if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; } },
    seek: s => { if (videoRef.current) videoRef.current.currentTime = s; },
    setRate: r => { if (videoRef.current) videoRef.current.playbackRate = r; },
    setVolume: v => { if (videoRef.current) videoRef.current.volume = v; },
    setMuted: m => { if (videoRef.current) videoRef.current.muted = m; },
    setResizeMode: () => {},
    getState: () => stateRef.current,
    flush,
  }), [flush]);

  // `source` is resolved imperatively rather than as the `src` JSX prop,
  // because a source that authenticates via request headers has to be fetched
  // before there is a URL to put in the prop. The no-headers path still lands
  // synchronously, so the common case is unaffected. See to-be-done.md FG-2.2.
  const slot = useRef<WebSourceSlot>(undefined as unknown as WebSourceSlot);
  if (!slot.current) slot.current = new WebSourceSlot();

  // Both read through refs so the effect below depends only on `sourceKey`.
  // `source` and `emit` get fresh identities every render (an inline object
  // literal, a fresh closure), and depending on either would re-fetch on every
  // render. Reading through a ref also means the effect never calls a stale
  // `onEvent`/`onStateChange` from the render it was created in.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const emitRef = useRef(emit);
  emitRef.current = emit;

  const sourceKey = `${source.uri}|${source.type ?? ''}|${JSON.stringify(source.headers ?? null)}`;

  useEffect(() => {
    if (!videoRef.current) return;
    let cancelled = false;
    void slot.current.load(sourceRef.current).then((result) => {
      // `cancelled` covers unmount; the slot's own generation covers a newer
      // `source` winning the race.
      if (cancelled || result.kind === 'stale' || !videoRef.current) return;
      if (result.kind === 'error') {
        // Loud, per FG-2.2: a source that 401s would otherwise leave an element
        // that never fires `error`.
        emitRef.current({ status: 'error', error: result.message });
        return;
      }
      videoRef.current.src = result.url;
      videoRef.current.currentTime = 0;
    });
    return () => {
      cancelled = true;
    };
    // `sourceKey` identifies the source by *value*. A caller passing an inline
    // `{ uri, headers }` literal gets a new object identity every render, so
    // depending on `source` itself would re-fetch on every render.
  }, [sourceKey]);

  useEffect(
    () => () => {
      // Free the header-auth blob on unmount.
      slot.current.release();
    },
    []
  );

  useEffect(() => { if (videoRef.current) videoRef.current.volume = volume; }, [volume]);
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate; }, [rate]);
  useEffect(() => {
    if (!videoRef.current) return;
    if (paused) videoRef.current.pause(); else if (autoPlay) void videoRef.current.play();
  }, [paused, autoPlay]);

  const objectFit = resizeMode === 'cover' ? 'cover' : resizeMode === 'stretch' ? 'fill' : resizeMode === 'none' ? 'none' : 'contain';

  return React.createElement('video', {
    ref: videoRef as any,
    // No `src` prop: the effect above assigns it once the source resolves, so
    // that a header-auth source has a URL to assign. See to-be-done.md FG-2.2.
    autoPlay,
    loop: repeat,
    muted,
    playsInline: true,
    preload: 'metadata',
    style: { width: '100%', height: 200, objectFit, backgroundColor: '#000', ...(style as any) },
    onLoadedMetadata: (e: any) => emit({ status: 'ready', duration: e.currentTarget.duration || 0 }),
    onPlay: () => emit({ status: 'playing' }),
    onPause: () => emit({ status: 'paused' }),
    onWaiting: () => emit({ status: 'buffering' }),
    onTimeUpdate: (e: any) => {
      const t: HTMLVideoElement = e.currentTarget;
      setState(prev => ({ ...prev, position: t.currentTime, duration: t.duration || prev.duration }));
      onProgress?.(t.currentTime, t.duration || 0);
      onEvent?.({ type: 'progress', state, payload: { position: t.currentTime, duration: t.duration } });
    },
    onEnded: () => {
      emit({ status: 'ended' });
      onEvent?.({ type: 'ended', state });
    },
    onError: (e: any) => {
      emit({ status: 'error', error: e.currentTarget?.error?.message ?? 'video error' });
      onEvent?.({ type: 'error', state, payload: { message: e.currentTarget?.error?.message } });
    },
  } as any);
});
