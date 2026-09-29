import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import { MusicPlayer, MusicPlayerHandle } from '../components/MusicPlayer';
import type { MusicControls } from '../hooks/useMusicPlayer';
import { INITIAL_STATE } from '../utils/media';
import type {
  PlaybackState,
  RemoteControlOptions,
  RepeatMode,
  Track,
} from '../types';

interface MediaContextValue {
  state: PlaybackState;
  queue: { tracks: Track[]; index: number };
  controls: MusicPlayerHandle;
  setTracks: (tracks: Track[]) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
}

const MediaContext = createContext<MediaContextValue | null>(null);

export interface MediaProviderProps {
  initialTracks?: Track[];
  repeatMode?: RepeatMode;
  shuffle?: boolean;
  remoteControls?: RemoteControlOptions;
  autoPlay?: boolean;
  children: React.ReactNode;
}

/**
 * App-wide media context. Mount once near the root to share a single music
 * player across screens.
 */
export function MediaProvider({
  initialTracks = [],
  repeatMode,
  shuffle,
  remoteControls,
  autoPlay,
  children,
}: MediaProviderProps) {
  const ref = useRef<MusicPlayerHandle>(null);
  const [tracks, setTracksState] = useState<Track[]>(initialTracks);
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
  const [index, setIndex] = useState(0);

  // Live mirrors so the facade below can stay identity-stable across renders.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const stateRef = useRef(state);
  stateRef.current = state;
  const indexRef = useRef(index);
  indexRef.current = index;

  /**
   * `controls` is a delegating facade rather than `ref.current`.
   *
   * Reading `ref.current` during render is the original bug: refs are attached
   * during commit, *after* the render that builds the context value, so
   * `useMedia().controls` was `null` on the first render and stayed null
   * unless something unrelated forced a second render. Every method here
   * dereferences at call time instead, so the object is always safe to call and
   * never captures a stale handle.
   *
   * Deliberately not a `Proxy`: it would break `Object.keys`, spread and devtools
   * introspection for no benefit over 18 explicit one-line delegations.
   */
  const controls = useMemo<MusicPlayerHandle>(() => {
    const call =
      (key: keyof MusicControls) =>
      (...args: any[]) =>
        (ref.current?.[key] as any)?.(...args);
    return {
      setQueue: call('setQueue'),
      addTracks: call('addTracks'),
      removeTrack: call('removeTrack'),
      skipTo: call('skipTo'),
      next: call('next'),
      previous: call('previous'),
      play: call('play'),
      pause: call('pause'),
      stop: call('stop'),
      seek: call('seek'),
      setRate: call('setRate'),
      setVolume: call('setVolume'),
      setMuted: call('setMuted'),
      setRepeatMode: call('setRepeatMode'),
      setShuffle: call('setShuffle'),
      setRemoteControls: call('setRemoteControls'),
      setBackgroundEnabled: call('setBackgroundEnabled'),
      // Pre-mount fallback only; once the player exists these come from it.
      getState: () => ref.current?.getState() ?? stateRef.current,
      getQueue: () =>
        ref.current?.getQueue() ?? { tracks: tracksRef.current, index: indexRef.current },
    } as MusicPlayerHandle;
  }, []);

  const setTracks = useCallback((next: Track[]) => {
    setTracksState(next);
    ref.current?.setQueue(next);
    // A new queue restarts from the top; the native `onTrackChange` will
    // correct this if the player disagrees.
    setIndex(0);
  }, []);

  const toggle = useCallback(() => {
    const s = controls.getState();
    if (s?.status === 'playing') controls.pause();
    else controls.play();
  }, [controls]);

  const value: MediaContextValue = {
    state,
    queue: { tracks, index },
    controls,
    setTracks,
    toggle,
    next: () => ref.current?.next(),
    previous: () => ref.current?.previous(),
  };

  return (
    <MediaContext.Provider value={value}>
      <MusicPlayer
        ref={ref}
        tracks={tracks}
        repeatMode={repeatMode}
        shuffle={shuffle}
        remoteControls={remoteControls}
        autoPlay={autoPlay}
        onEvent={(e) => {
          // Propagated on every native emission, not just status changes, so
          // `state.position` tracks the track. See to-be-done.md FG-1.1.
          if (e.state) setState(e.state);
        }}
      />
      {children}
    </MediaContext.Provider>
  );
}

export function useMedia(): MediaContextValue {
  const ctx = useContext(MediaContext);
  if (!ctx) {
    throw new Error('useMedia must be used within a <MediaProvider>.');
  }
  return ctx;
}
