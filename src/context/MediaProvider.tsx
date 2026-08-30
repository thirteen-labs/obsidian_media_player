import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
} from 'react';
import { MusicPlayer, MusicPlayerHandle } from '../components/MusicPlayer';
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
  const [snapshot, setSnapshot] = useState<{
    state: PlaybackState;
    queue: { tracks: Track[]; index: number };
  }>({ state: ref.current?.getState() ?? ({} as PlaybackState), queue: { tracks, index: 0 } });

  const setTracks = useCallback((next: Track[]) => {
    setTracksState(next);
    ref.current?.setQueue(next);
  }, []);

  const toggle = useCallback(() => {
    const s = ref.current?.getState();
    if (s?.status === 'playing') ref.current?.pause();
    else ref.current?.play();
  }, []);

  const value: MediaContextValue = {
    state: snapshot.state,
    queue: snapshot.queue,
    controls: ref.current as MusicPlayerHandle,
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
          if (e.state) setSnapshot((prev) => ({ ...prev, state: e.state! }));
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
