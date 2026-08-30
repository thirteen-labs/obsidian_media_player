import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from 'react';
import ObsidianVideo, { Commands } from '../native/VideoNative';
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
  const innerRef = useRef<any>(null);
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
      play: () => Commands.play(innerRef.current),
      pause: () => Commands.pause(innerRef.current),
      stop: () => Commands.stop(innerRef.current),
      seek: (seconds) => Commands.seek(innerRef.current, seconds),
      setRate: (r) => Commands.setRate(innerRef.current, r),
      setVolume: (v) => Commands.setVolume(innerRef.current, v),
      setMuted: (m) => Commands.setMuted(innerRef.current, m),
      setResizeMode: (mode) => Commands.setResizeMode(innerRef.current, mode),
      getState: () => state,
    }),
    [state]
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
        }
        if (autoPlay && parsed?.status === 'ready') Commands.play(innerRef.current);
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
