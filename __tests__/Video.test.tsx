/**
 * FG-1.2 / FG-1.3 / FG-1.5
 *
 *  - `useVideoPlayer().state` was the literal constant `INITIAL_STATE`; the hook
 *    had no way to observe the native player at all.
 *  - `Video`'s `getState()` read `state` from the handle closure and the handle
 *    was rebuilt on every state change, so a captured handle kept answering
 *    with stale data.
 *  - `Video.web.tsx` kept its own copy of `VideoHandle` and never received
 *    `flush`, so the web build threw where the type said it would work.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('../src/native/VideoNative', () => {
  const ReactMod = require('react');
  const { act: actFn } = require('react-test-renderer');

  const commands = {
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    seek: jest.fn(),
    setRate: jest.fn(),
    setVolume: jest.fn(),
    setMuted: jest.fn(),
    setResizeMode: jest.fn(),
  };

  let latest: any = null;
  const Comp = ReactMod.forwardRef((props: any, _ref: any) => {
    latest = props;
    return null;
  });

  return {
    __esModule: true,
    default: Comp,
    VideoCommands: commands,
    __latest: () => latest,
    __reset: () => {
      latest = null;
    },
    __emitStateChange: (state: any) =>
      actFn(() => latest?.onStateChange?.({ nativeEvent: { stateJson: JSON.stringify(state) } })),
    __emitProgress: (position: number, duration: number) =>
      actFn(() => latest?.onProgress?.({ nativeEvent: { position, duration } })),
    __emitBuffering: (buffered: number) =>
      actFn(() => latest?.onBuffering?.({ nativeEvent: { buffered } })),
    __emitEnded: () => actFn(() => latest?.onEnded?.()),
    __emitError: (message: string) =>
      actFn(() => latest?.onError?.({ nativeEvent: { message } })),
  };
});

import { Video, type VideoHandle } from '../src/components/Video';
import { useVideoPlayer } from '../src/hooks/useVideoPlayer';
import { INITIAL_STATE } from '../src/utils/media';
import { renderHook } from './helpers';
import type { PlaybackState } from '../src/types';

const native = jest.requireMock('../src/native/VideoNative') as any;
const source = { uri: 'https://cdn.test/clip.mp4' };

const state = (over: Partial<PlaybackState> = {}): PlaybackState => ({
  ...INITIAL_STATE,
  ...over,
});

/** Mounts <Video>, returning the imperative handle and an unmount fn. */
function mountVideo(props: Record<string, unknown> = {}) {
  const ref = React.createRef<VideoHandle>();
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(Video, { source, ...props, ref } as any)
    );
  });
  return {
    handle: () => ref.current as VideoHandle,
    unmount: () => act(() => { renderer.unmount(); }),
  };
}

beforeEach(() => {
  native.__reset();
  Object.values(native.VideoCommands).forEach((fn: any) => fn.mockClear());
});

describe('Video handle: live getState (FG-1.3)', () => {
  test('getState reports the latest emission, not the value at mount', () => {
    const h = mountVideo();
    expect(h.handle().getState().status).toBe('idle');

    native.__emitStateChange(state({ status: 'ready', duration: 120 }));
    expect(h.handle().getState().status).toBe('ready');
    expect(h.handle().getState().duration).toBe(120);

    native.__emitStateChange(state({ status: 'playing', position: 5 }));
    expect(h.handle().getState().status).toBe('playing');
    expect(h.handle().getState().position).toBe(5);
    h.unmount();
  });

  test('a handle captured earlier still reports current state', () => {
    const h = mountVideo();
    // Captured once, before any emission — the pattern that was broken.
    const captured = h.handle();

    native.__emitStateChange(state({ status: 'playing', position: 99 }));

    // Previously the captured closure kept returning the mount-time value.
    expect(captured.getState().status).toBe('playing');
    expect(captured.getState().position).toBe(99);
    h.unmount();
  });

  test('handle identity is stable across state changes', () => {
    const h = mountVideo();
    const first = h.handle();

    native.__emitStateChange(state({ status: 'ready' }));
    native.__emitStateChange(state({ status: 'playing' }));
    native.__emitProgress(3, 100);
    native.__emitProgress(6, 100);

    // Rebuilt on every state change before, so consumers putting the handle in
    // a dependency array re-ran their effects several times a second.
    expect(h.handle()).toBe(first);
    h.unmount();
  });
});

describe('Video handle: flush (FG-1.3)', () => {
  test('resolves with the next emitted state', async () => {
    const h = mountVideo();
    const pending = h.handle().flush();
    native.__emitStateChange(state({ status: 'playing', position: 7 }));
    await expect(pending).resolves.toMatchObject({ status: 'playing', position: 7 });
    h.unmount();
  });

  test('resolves on the current state when nothing is playing', async () => {
    const h = mountVideo();
    // An idle/paused player emits no state changes, so flush() must not hang.
    await expect(h.handle().flush(10)).resolves.toMatchObject({ status: 'idle' });
    h.unmount();
  });

  test('does not resolve before an emission arrives', async () => {
    const h = mountVideo();
    let settled = false;
    h.handle().flush(1000).then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);
    h.unmount();
  });
});

describe('Video commands', () => {
  test('play/pause/seek forward to the native commands', () => {
    const h = mountVideo();

    h.handle().play();
    h.handle().pause();
    h.handle().seek(42);
    h.handle().setVolume(0.25);
    h.handle().setResizeMode('cover');

    expect(native.VideoCommands.play).toHaveBeenCalled();
    expect(native.VideoCommands.pause).toHaveBeenCalled();

    // The first argument is the native view ref, which the mock never attaches
    // (so it is null). Asserting on it with `expect.anything()` would fail,
    // since that matcher rejects null and undefined — check the payload only.
    expect(native.VideoCommands.seek.mock.calls[0][1]).toBe(42);
    expect(native.VideoCommands.setVolume.mock.calls[0][1]).toBe(0.25);
    expect(native.VideoCommands.setResizeMode.mock.calls[0][1]).toBe('cover');
    h.unmount();
  });

  test('onStateChange prop is called with the parsed snapshot', () => {
    const onStateChange = jest.fn();
    const h = mountVideo({ onStateChange });

    native.__emitStateChange(state({ status: 'buffering' }));

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'buffering' })
    );
    h.unmount();
  });

  test('onProgress prop receives position and duration', () => {
    const onProgress = jest.fn();
    const h = mountVideo({ onProgress });

    native.__emitProgress(12.5, 200);

    expect(onProgress).toHaveBeenCalledWith(12.5, 200);
    h.unmount();
  });

  test('errors and end-of-source surface through onEvent', () => {
    // `VideoProps` has no `onError`; native errors and the ended event are
    // reported through the general `onEvent` stream.
    const onEvent = jest.fn();
    const h = mountVideo({ onEvent });

    native.__emitError('HTTP 404');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        payload: { message: 'HTTP 404' },
      })
    );

    native.__emitEnded();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ended' })
    );
    h.unmount();
  });

  test('buffering events surface through onEvent', () => {
    const onEvent = jest.fn();
    const h = mountVideo({ onEvent });

    native.__emitBuffering(4.5);

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'buffering', payload: { buffered: 4.5 } })
    );
    h.unmount();
  });
});

describe('useVideoPlayer (FG-1.2)', () => {
  test('state starts at INITIAL_STATE and is never the frozen constant again', () => {
    const { result, unmount } = renderHook(() => useVideoPlayer());
    expect(result.current.state).toEqual(INITIAL_STATE);
    unmount();
  });

  test('onState updates the hook state', () => {
    const { result, act, unmount } = renderHook(() => useVideoPlayer());

    act(() => result.current.onState(state({ status: 'playing', position: 8 })));

    // The regression: `state` was `const state = INITIAL_STATE`, so this never
    // changed no matter what happened natively.
    expect(result.current.state.status).toBe('playing');
    expect(result.current.state.position).toBe(8);
    unmount();
  });

  test('onState has a stable identity so it never re-renders <Video> on its own', () => {
    const { result, act, unmount } = renderHook(() => useVideoPlayer());
    const first = result.current.onState;

    act(() => result.current.onState(state({ status: 'ready' })));

    expect(result.current.onState).toBe(first);
    unmount();
  });

  test('controls identity is stable', () => {
    const { result, act, unmount } = renderHook(() => useVideoPlayer());
    const first = result.current.controls;

    act(() => result.current.onState(state({ status: 'playing' })));

    expect(result.current.controls).toBe(first);
    unmount();
  });

  test('controls.getState is live once the video is mounted', () => {
    const { result, act, unmount } = renderHook(() => useVideoPlayer());
    const ref = result.current.ref;

    // Mount a real <Video> wired to this hook, the documented usage.
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Video, {
          source,
          ref: ref as any,
          onStateChange: result.current.onState,
        } as any)
      );
    });

    native.__emitStateChange(state({ status: 'playing', position: 15 }));

    expect(result.current.controls.getState().position).toBe(15);
    expect(result.current.state.position).toBe(15);
    act(() => { renderer.unmount(); });
    unmount();
  });

  test('controls.getState falls back to the hook state before mounting', () => {
    const { result, act, unmount } = renderHook(() => useVideoPlayer());
    act(() => result.current.onState(state({ status: 'ready' })));

    expect(result.current.controls.getState().status).toBe('ready');
    unmount();
  });

  test('controls.flush delegates to the mounted video', async () => {
    const { result, act, unmount } = renderHook(() => useVideoPlayer());
    const ref = result.current.ref;

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(Video, {
          source,
          ref: ref as any,
          onStateChange: result.current.onState,
        } as any)
      );
    });

    const pending = result.current.controls.flush();
    native.__emitStateChange(state({ status: 'playing', position: 3 }));

    await expect(pending).resolves.toMatchObject({ position: 3 });
    act(() => { renderer.unmount(); });
    unmount();
  });
});
