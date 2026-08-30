import { useRef, useMemo, type RefObject } from 'react';
import { INITIAL_STATE } from '../utils/media';
import type { PlaybackState } from '../types';
import type { VideoHandle } from '../components/Video';

export interface VideoControls extends VideoHandle {}

/**
 * Headless controller for the <Video> component. Use the returned `ref` as the
 * component's ref and call the control methods to drive playback.
 *
 *   const { ref, controls } = useVideoPlayer();
 *   return <Video ref={ref} source={...} />;
 */
export function useVideoPlayer(): {
  ref: RefObject<VideoHandle>;
  controls: VideoControls;
  state: PlaybackState;
} {
  const ref = useRef<VideoHandle>(null);
  const state = INITIAL_STATE;

  const controls = useMemo<VideoControls>(
    () => ({
      play: () => ref.current?.play(),
      pause: () => ref.current?.pause(),
      stop: () => ref.current?.stop(),
      seek: (s) => ref.current?.seek(s),
      setRate: (r) => ref.current?.setRate(r),
      setVolume: (v) => ref.current?.setVolume(v),
      setMuted: (m) => ref.current?.setMuted(m),
      setResizeMode: (m) => ref.current?.setResizeMode(m),
      getState: () => ref.current?.getState() ?? state,
    }),
    [state]
  );

  return { ref, controls, state };
}
