/**
 * FG-1.3 (extended to `<Audio>`)
 *
 * `Audio` had the same two defects as `Video` and `MusicPlayer`: the handle
 * closed over `state` and was rebuilt on every emission, and `onEvent` fired
 * only when `state.status` changed, so position and duration never propagated.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Audio, type AudioHandle } from '../src/components/Audio';
import { AUDIO_EVENTS } from '../src/core/Events';
import { INITIAL_STATE } from '../src/utils/media';
import { nativeMocks, emitNative, stateEvent } from './helpers';
import type { PlaybackState } from '../src/types';

const state = (over: Partial<PlaybackState> = {}): PlaybackState => ({
  ...INITIAL_STATE,
  ...over,
});

function mountAudio(props: Record<string, unknown> = {}) {
  const ref = React.createRef<AudioHandle>();
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(Audio, { source: { uri: 'https://cdn.test/a.mp3' }, ...props, ref } as any)
    );
  });
  return {
    handle: () => ref.current as AudioHandle,
    unmount: () => act(() => { renderer.unmount(); }),
  };
}

beforeEach(() => {
  nativeMocks().audio.__listenerCalls.length = 0;
  Object.values(nativeMocks().audio).forEach((v) => {
    if (typeof v === 'function' && v.mockClear) v.mockClear();
  });
});

describe('Audio handle (FG-1.3)', () => {
  test('getState is live for a handle captured before any emission', () => {
    const h = mountAudio();
    const captured = h.handle();
    expect(captured.getState().status).toBe('idle');

    emitNative(AUDIO_EVENTS.STATE, stateEvent(state({ status: 'playing', position: 11 })));

    expect(captured.getState().status).toBe('playing');
    expect(captured.getState().position).toBe(11);
    h.unmount();
  });

  test('handle identity is stable across state changes', () => {
    const h = mountAudio();
    const first = h.handle();

    emitNative(AUDIO_EVENTS.STATE, stateEvent(state({ status: 'ready' })));
    emitNative(AUDIO_EVENTS.PROGRESS, { position: 4, duration: 90 });
    emitNative(AUDIO_EVENTS.PROGRESS, { position: 8, duration: 90 });

    expect(h.handle()).toBe(first);
    h.unmount();
  });

  test('controls delegate to the native audio module', () => {
    const h = mountAudio();
    const { audio } = nativeMocks();

    h.handle().play();
    h.handle().seek(30);
    h.handle().setLoop(true);

    expect(audio.play).toHaveBeenCalled();
    expect(audio.seek).toHaveBeenCalledWith(30);
    expect(audio.setLoop).toHaveBeenCalledWith(true);
    h.unmount();
  });
});

describe('Audio onEvent (FG-1.3)', () => {
  test('fires on progress ticks, not only on status changes', () => {
    const onEvent = jest.fn();
    const h = mountAudio({ onEvent });

    emitNative(AUDIO_EVENTS.STATE, stateEvent(state({ status: 'playing' })));
    onEvent.mockClear();

    emitNative(AUDIO_EVENTS.PROGRESS, { position: 21, duration: 200 });

    // The regression: the effect was gated on `state.status`, which a progress
    // tick does not change, so this reported nothing.
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'state', state: expect.objectContaining({ position: 21 }) })
    );
    h.unmount();
  });

  test('an inline onEvent callback does not cause an infinite render loop', () => {
    // Regression guard for the same loop found in MusicPlayer: depending on
    // `onEvent` in the effect deps gave a new identity every render, and the
    // effect set state in the parent.
    let calls = 0;
    const Wrapper = () => {
      const [, force] = React.useState(0);
      return React.createElement(Audio, {
        source: { uri: 'https://cdn.test/a.mp3' },
        onEvent: () => {
          calls += 1;
          // Hard cap: an uncapped loop makes the test *hang* rather than fail,
          // which is useless in CI and leaves the run with no verdict.
          if (calls < 200) force((n) => n + 1);
        },
      } as any);
    };

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(Wrapper));
    });
    emitNative(AUDIO_EVENTS.STATE, stateEvent(state({ status: 'playing' })));

    // One call for the mount effect, one for the emission. A loop would
    // saturate the cap.
    expect(calls).toBeLessThan(10);
    act(() => { renderer.unmount(); });
  });
});
