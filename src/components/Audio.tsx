import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
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

  // Live mirror so the handle keeps a stable identity while `getState()` still
  // answers with the current value. Reading `state` from the closure froze the
  // answer at whichever render last rebuilt the handle, and rebuilding it on
  // every emission churned any consumer holding it in a dependency array.
  // Matches `Video` and `MusicPlayer`. See to-be-done.md FG-1.3.
  const stateRef = useRef(state);
  stateRef.current = state;

  useImperativeHandle(
    ref,
    (): AudioHandle => ({ ...controls, getState: () => stateRef.current }),
    [controls]
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

  // `onEvent` is usually an inline arrow, so it gets a fresh identity every
  // render. Holding it in a ref keeps it out of the effect's dependency list —
  // depending on it directly re-ran this effect each render, and since the
  // effect calls back into the parent (which usually setStates) that became an
  // infinite render loop.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    onEventRef.current?.({ type: 'state', state });
    // Fires on every native emission, not just status transitions. Gating on
    // `state.status` meant position and duration never reached listeners, so a
    // progress bar bound to `onEvent` sat at 0 for the whole track.
  }, [state]);

  return null;
});
