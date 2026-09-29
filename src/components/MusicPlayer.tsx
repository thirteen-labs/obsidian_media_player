import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { useMusicPlayer } from '../hooks/useMusicPlayer';
import type {
  MusicPlayerHandle,
  MusicPlayerProps,
  RepeatMode,
} from '../types';

// Re-exported so existing `from './components/MusicPlayer'` imports keep
// working. The definition lives in `types.ts` so the web component can share it
// and the two handles cannot drift — see to-be-done.md FG-1.5 / FG-2.1.
export type { MusicPlayerHandle };

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

    // Live mirrors, so the handle can keep a stable identity while `getState()`
    // and `getQueue()` still answer with current values. Rebuilding the handle
    // on every emission instead would re-churn any consumer that puts it in a
    // dependency array — and `state` changes several times a second while
    // playing. See to-be-done.md FG-1.3.
    const stateRef = useRef(state);
    stateRef.current = state;
    const queueRef = useRef(queue);
    queueRef.current = queue;

    useImperativeHandle(
      ref,
      (): MusicPlayerHandle => ({
        ...controls,
        getState: () => stateRef.current,
        getQueue: () => queueRef.current,
      }),
      [controls]
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

    // `onEvent` is usually an inline arrow, so it has a fresh identity on every
    // render. Holding it in a ref keeps it out of the effect's dependency list:
    // depending on it directly re-ran this effect each render, and since the
    // effect calls back into the parent — which usually setStates — that became
    // an infinite render loop ("Maximum update depth exceeded").
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    useEffect(() => {
      onEventRef.current?.({ type: 'state', state });
      // Fires on every native emission, not just status transitions. Gating on
      // `state.status` meant position and duration never reached listeners, so a
      // progress bar bound to `onEvent` sat at 0 for the whole track.
      //
      // The cost is a re-render of the `onEvent` consumer on every emission,
      // which while playing is a few times a second. That is unavoidable for a
      // correct progress readout — there is no context selector in the library
      // to narrow it, so keep the `onEvent` handler's own work cheap and let
      // React.memo do the rest. `usePlaybackState` only derives flags from a
      // state you already hold; it does not reduce how often you re-render.
    }, [state]);

    return null;
  }
);
