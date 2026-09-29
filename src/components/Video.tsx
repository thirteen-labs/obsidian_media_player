import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import ObsidianVideo, { VideoCommands } from '../native/VideoNative';
import { INITIAL_STATE, parseState, sourceToJson } from '../utils/media';
import type { PlaybackState, VideoHandle, VideoProps } from '../types';

// Re-exported for backwards compatibility; the definition is shared with the
// web build so the two cannot drift.
export type { VideoHandle };

export const Video = forwardRef<VideoHandle, VideoProps>(function Video(
  {
    source,
    paused = false,
    muted = false,
    volume = 1,
    rate = 1,
    resizeMode = 'contain',
    autoPlay = false,
    repeat = false,
    onEvent,
    onStateChange,
    onProgress,
    style,
  },
  ref
) {
  const innerRef = useRef<any>(null);
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);

  // `getState()` is synchronous, so it must report the most recent native
  // emission. Reading `state` from the handle closure froze the answer at
  // whichever render last rebuilt the handle — and the handle was rebuilt on
  // every state change, so any consumer holding an older handle kept seeing
  // stale data. The ref gives a *stable* handle that always answers from the
  // live value. See to-be-done.md FG-1.3.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Callers of `flush()` waiting on the next native emission.
  const pendingFlushes = useRef<
    Array<{
      resolve: (s: PlaybackState) => void;
      timer: ReturnType<typeof setTimeout>;
    }>
  >([]);

  const settleFlushes = useCallback((next: PlaybackState) => {
    const pending = pendingFlushes.current;
    pendingFlushes.current = [];
    pending.forEach((p) => {
      clearTimeout(p.timer);
      p.resolve(next);
    });
  }, []);

  const flush = useCallback(
    (timeoutMs = 1000) =>
      new Promise<PlaybackState>((resolve) => {
        // Bounded on purpose: an idle, paused or ended player emits no state
        // changes, so an unbounded flush() would hang forever.
        const timer = setTimeout(() => resolve(stateRef.current), timeoutMs);
        pendingFlushes.current.push({ resolve, timer });
      }),
    []
  );

  useEffect(
    () => () => {
      pendingFlushes.current.forEach((p) => clearTimeout(p.timer));
      pendingFlushes.current = [];
    },
    []
  );

  const emit = useCallback(
    (type: any, payload?: Record<string, unknown>, s?: PlaybackState) => {
      const next = s ?? stateRef.current;
      if (s) setState(s);
      onEvent?.({ type, state: next, payload });
    },
    [onEvent]
  );

  useImperativeHandle(
    ref,
    (): VideoHandle => ({
      play: () => VideoCommands.play(innerRef.current),
      pause: () => VideoCommands.pause(innerRef.current),
      stop: () => VideoCommands.stop(innerRef.current),
      seek: (seconds) => VideoCommands.seek(innerRef.current, seconds),
      setRate: (r) => VideoCommands.setRate(innerRef.current, r),
      setVolume: (v) => VideoCommands.setVolume(innerRef.current, v),
      setMuted: (m) => VideoCommands.setMuted(innerRef.current, m),
      setResizeMode: (mode) => VideoCommands.setResizeMode(innerRef.current, mode),
      getState: () => stateRef.current,
      flush,
    }),
    [flush]
  );

  return (
    <ObsidianVideo
      ref={innerRef}
      style={[{ width: '100%', height: 200 }, style]}
      sourceJson={sourceToJson(source)}
      paused={paused}
      muted={muted}
      volume={volume}
      rate={rate}
      resizeMode={resizeMode}
      repeat={repeat}
      onStateChange={(e: any) => {
        const parsed = parseState(e?.nativeEvent?.stateJson ?? e?.stateJson);
        if (parsed) {
          setState(parsed);
          onStateChange?.(parsed);
          emit('state', undefined, parsed);
          settleFlushes(parsed);
        }
        if (autoPlay && parsed?.status === 'ready') VideoCommands.play(innerRef.current);
      }}
      onProgress={(e: any) => {
        const ne = e?.nativeEvent ?? e;
        onProgress?.(ne?.position ?? 0, ne?.duration ?? 0);
        emit('progress', { position: ne?.position, duration: ne?.duration });
      }}
      onBuffering={(e: any) => emit('buffering', { buffered: e?.nativeEvent?.buffered ?? e?.buffered })}
      onEnded={() => emit('ended')}
      onError={(e: any) =>
        emit('error', { message: e?.nativeEvent?.message ?? e?.message })
      }
    />
  );
});
