import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { INITIAL_STATE } from '../utils/media';
import type { PlaybackState } from '../types';
import type { VideoHandle } from '../components/Video';

export interface VideoControls extends VideoHandle {}

export interface UseVideoPlayerResult {
  ref: RefObject<VideoHandle>;
  controls: VideoControls;
  /** Live state, updated on every native emission. See `onState`. */
  state: PlaybackState;
  /**
   * Pass this to `<Video onStateChange={...}>` — without it `state` stays at
   * its initial value, because the hook has no way to observe the native
   * player on its own.
   *
   *   const { ref, controls, state, onState } = useVideoPlayer();
   *   return <Video ref={ref} source={source} onStateChange={onState} />;
   *
   * Stable identity, so it never re-renders the `<Video>` on its own account.
   */
  onState: (state: PlaybackState) => void;
}

/**
 * Headless controller for the <Video> component. Use the returned `ref` as the
 * component's ref and call the control methods to drive playback.
 *
 *   const { ref, controls, state, onState } = useVideoPlayer();
 *   return <Video ref={ref} source={source} onStateChange={onState} />;
 *
 * The subscription is an explicit prop rather than an implicit one because
 * `<Video>` is an ordinary component that knows nothing about this hook. Each
 * hook instance tracks its own player, so multiple `<Video>` elements can be
 * driven independently.
 */
export function useVideoPlayer(): UseVideoPlayerResult {
  const ref = useRef<VideoHandle>(null);
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);

  // Mirrors `state` so the memoized controls can read the live value without
  // being rebuilt (and without a stale closure) on every emission.
  const stateRef = useRef(state);
  stateRef.current = state;

  const onState = useCallback((next: PlaybackState) => {
    stateRef.current = next;
    setState(next);
  }, []);

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
      // The <Video> handle is itself live, so this is authoritative once the
      // video is mounted; the ref is the pre-mount fallback.
      getState: () => ref.current?.getState() ?? stateRef.current,
      flush: (timeoutMs) => ref.current?.flush(timeoutMs) ?? Promise.resolve(stateRef.current),
    }),
    []
  );

  return { ref, controls, state, onState };
}
