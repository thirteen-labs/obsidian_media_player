import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  type Ref,
} from 'react';
import ObsidianVideo, { VideoCommands } from '../native/VideoNative';
import { INITIAL_STATE, parseState, sourceToJson } from '../utils/media';
import type { PlaybackState, VideoProps } from '../types';

export interface VideoHandle {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setResizeMode: (mode: string) => void;
  getState: () => PlaybackState;
}

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
  const innerRef = useRef<VideoHandle | null>(null);
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);

  const emit = useCallback(
    (type: any, payload?: Record<string, unknown>, s?: PlaybackState) => {
      const next = s ?? state;
      if (s) setState(s);
      onEvent?.({ type, state: next, payload });
    },
    [onEvent, state]
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
      getState: () => state,
    }),
    [state]
  );

  return (
    <ObsidianVideo
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
