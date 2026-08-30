import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import type { AudioControls } from '../hooks/useAudioPlayer';
import type { AudioProps, PlaybackState } from '../types';

export interface AudioHandle extends Omit<AudioControls, 'getState'> {
  getState: () => PlaybackState;
}

/**
 * Headless audio player. Renders nothing; control it imperatively via the
 * ref or declaratively through `source` / `paused` props.
 */
export const Audio = forwardRef<AudioHandle, AudioProps>(function Audio(
  { source, paused = false, volume = 1, rate = 1, autoPlay = false, loop = false, onEvent },
  ref
) {
  const { state, controls } = useAudioPlayer(source);

  useImperativeHandle(
    ref,
    (): AudioHandle => ({ ...controls, getState: () => state }),
    [controls, state]
  );

  // Keep declarative props in sync with the native player.
  useEffect(() => {
    controls.setVolume(volume);
  }, [volume, controls]);
  useEffect(() => {
    controls.setRate(rate);
  }, [rate, controls]);
  useEffect(() => {
    controls.setLoop(loop);
  }, [loop, controls]);
  useEffect(() => {
    if (paused) controls.pause();
    else if (autoPlay) controls.play();
  }, [paused, autoPlay, controls]);

  useEffect(() => {
    onEvent?.({
      type: state.status === 'playing' ? 'state' : 'state',
      state,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  return null;
});
