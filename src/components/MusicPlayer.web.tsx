import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useMusicPlayer } from '../hooks/useMusicPlayer';
import type {
  MusicPlayerHandle,
  MusicPlayerProps,
  Track,
} from '../types';

// Re-exported for parity with the native component; the definition is shared
// with it so the two handles cannot drift. See to-be-done.md FG-1.5 / FG-2.1.
export type { MusicPlayerHandle };

/**
 * Web fallback for <MusicPlayer>. Drives a single `HTMLAudioElement` through
 * `hooks/useMusicPlayer.web.ts`, which reuses the same `PlaylistManager` as the
 * native players, so shuffle / repeat / skip semantics match exactly.
 *
 * Renders nothing — pair it with your own UI, same as the native component.
 *
 * Not supported on web, by platform limit rather than omission: background
 * audio and lock-screen remote controls have no browser equivalent. The props
 * that control them (`remoteControls`) are accepted and ignored so shared code
 * does not need a platform branch.
 */
export const MusicPlayer = forwardRef<MusicPlayerHandle, MusicPlayerProps>(
  function MusicPlayerWeb(
    { tracks, autoPlay = false, repeatMode = 'off', shuffle = false, remoteControls, onEvent },
    ref
  ) {
    const { state, queue, controls } = useMusicPlayer(tracks);

    // Live mirrors so the handle keeps a stable identity while `getState()` and
    // `getQueue()` still answer with current values. Matches the native
    // component. See to-be-done.md FG-1.3.
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
      controls.setRepeatMode(repeatMode);
    }, [repeatMode, controls]);
    useEffect(() => {
      controls.setShuffle(shuffle);
    }, [shuffle, controls]);
    // `remoteControls` and background audio have no browser equivalent; the
    // web hook treats them as no-ops. Kept as an explicit effect so the
    // behaviour is visible rather than an unexplained missing call.
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
    // render. Held in a ref to keep it out of the effect's dependency list —
    // depending on it re-runs the effect each render and loops, since the
    // effect calls back into the parent. Matches the native component.
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    useEffect(() => {
      onEventRef.current?.({ type: 'state', state });
    }, [state]);

    return null;
  }
);

export type { Track };
