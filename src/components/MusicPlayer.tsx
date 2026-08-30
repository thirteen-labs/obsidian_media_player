import React, { forwardRef, useImperativeHandle, useEffect } from 'react';
import { useMusicPlayer, MusicControls } from '../hooks/useMusicPlayer';
import type {
  MusicPlayerProps,
  PlaybackState,
  RepeatMode,
  Track,
} from '../types';

export interface MusicPlayerHandle extends Omit<MusicControls, 'getState' | 'getQueue'> {
  getState: () => PlaybackState;
  getQueue: () => { tracks: Track[]; index: number };
}

/**
 * Headless music player with full playlist / queue support, background audio
 * and lock-screen remote controls. Renders nothing; pair it with your own UI
 * and the `usePlaybackState` / `useRemoteControls` hooks.
 */
export const MusicPlayer = forwardRef<MusicPlayerHandle, MusicPlayerProps>(
  function MusicPlayer(
    {
      tracks,
      autoPlay = false,
      repeatMode = 'off',
      shuffle = false,
      remoteControls,
      onEvent,
    },
    ref
  ) {
    const { state, queue, controls } = useMusicPlayer(tracks);

    useImperativeHandle(
      ref,
      (): MusicPlayerHandle => ({
        ...controls,
        getState: () => state,
        getQueue: () => queue,
      }),
      [controls, state, queue]
    );

    useEffect(() => {
      controls.setRepeatMode(repeatMode as RepeatMode);
    }, [repeatMode, controls]);
    useEffect(() => {
      controls.setShuffle(shuffle);
    }, [shuffle, controls]);
    useEffect(() => {
      if (remoteControls) controls.setRemoteControls(remoteControls);
    }, [remoteControls, controls]);
    useEffect(() => {
      controls.setBackgroundEnabled(true);
      return () => controls.setBackgroundEnabled(false);
    }, [controls]);
    useEffect(() => {
      if (autoPlay) controls.play();
    }, [autoPlay, controls]);

    useEffect(() => {
      onEvent?.({ type: 'state', state });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.status]);

    return null;
  }
);
