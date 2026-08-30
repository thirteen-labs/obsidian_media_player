import { useMemo } from 'react';
import type { PlaybackState } from '../types';

export interface PlaybackDerived {
  isPlaying: boolean;
  isPaused: boolean;
  isBuffering: boolean;
  isLoading: boolean;
  isEnded: boolean;
  hasError: boolean;
  progress: number;
}

/** Derives convenient boolean flags + progress fraction from a PlaybackState. */
export function usePlaybackState(state: PlaybackState): PlaybackDerived {
  return useMemo(() => {
    const progress = state.duration > 0 ? state.position / state.duration : 0;
    return {
      isPlaying: state.status === 'playing',
      isPaused: state.status === 'paused',
      isBuffering: state.status === 'buffering',
      isLoading: state.status === 'loading' || state.status === 'idle',
      isEnded: state.status === 'ended',
      hasError: state.status === 'error',
      progress: Math.min(Math.max(progress, 0), 1),
    };
  }, [state]);
}
