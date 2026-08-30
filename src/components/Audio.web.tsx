import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
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

/** Pure-web Audio — HTMLAudioElement. Metro picks this file for `*.web.tsx`. */
export const Audio = forwardRef<AudioHandle, AudioProps>(function AudioWeb(
  { source, paused = false, volume = 1, rate = 1, autoPlay = false, loop = false },
  ref
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef<PlaybackState>({
    status: 'idle', position: 0, duration: 0, rate: 1, muted: false, volume: 1, buffered: 0, inBackground: false,
  });

  useImperativeHandle(ref, (): AudioHandle => ({
    load: s => { if (audioRef.current) audioRef.current.src = s.uri; },
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

  useEffect(() => {
    const el = new (globalThis as any).Audio(source.uri) as HTMLAudioElement;
    el.preload = 'metadata';
    el.volume = volume;
    el.playbackRate = rate;
    el.loop = loop;
    el.muted = false;
    if (autoPlay && !paused) void el.play();
    if (paused) el.pause();
    audioRef.current = el;
    return () => { el.pause(); el.src = ''; };
  }, []); // demo: static source

  return null;
});
