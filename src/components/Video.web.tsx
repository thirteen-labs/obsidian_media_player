import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { INITIAL_STATE, parseState } from '../utils/media';
import type { PlaybackState, VideoProps } from '../types';

export interface VideoHandle {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setResizeMode: (mode: string) => void;
  getState: () => PlaybackState;
}

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

  const emit = (next: Partial<PlaybackState> & { status?: PlaybackState['status'] }) => {
    setState(prev => {
      const merged = { ...prev, ...next } as PlaybackState;
      onStateChange?.(merged);
      onEvent?.({ type: 'state', state: merged });
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
    getState: () => state,
  }), [state]);

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
    src: source.uri,
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
