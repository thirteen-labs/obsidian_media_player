/**
 * FG-1.3 (extended to `<MusicPlayer>`) and the infinite-render-loop regression.
 *
 * `MusicPlayer` had the same stale-handle defect as `Video` and `Audio`, and its
 * `onEvent` was gated on `state.status`, so position and duration never reached
 * listeners — the reason a progress bar bound to `onEvent` sat at 0 for a whole
 * track.
 *
 * The loop guard here is not theoretical: fixing the `onEvent` gating initially
 * put `onEvent` in the effect's dependency list, and since consumers almost
 * always pass an inline arrow, that recursed until React gave up with
 * "Maximum update depth exceeded". `onEventRef` is the fix.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MusicPlayer, type MusicPlayerHandle } from '../src/components/MusicPlayer';
import { MUSIC_EVENTS } from '../src/core/Events';
import { INITIAL_STATE } from '../src/utils/media';
import { nativeMocks, emitNative, stateEvent } from './helpers';
import type { PlaybackState, Track } from '../src/types';

const tracks: Track[] = [
  { id: 'a', source: { uri: 'https://cdn.test/a.mp3' } },
  { id: 'b', source: { uri: 'https://cdn.test/b.mp3' } },
];

const state = (over: Partial<PlaybackState> = {}): PlaybackState => ({
  ...INITIAL_STATE,
  ...over,
});

function mountPlayer(props: Record<string, unknown> = {}) {
  const ref = React.createRef<MusicPlayerHandle>();
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(MusicPlayer, { tracks, ...props, ref } as any)
    );
  });
  return {
    handle: () => ref.current as MusicPlayerHandle,
    unmount: () => act(() => { renderer.unmount(); }),
  };
}

beforeEach(() => {
  nativeMocks().music.__listenerCalls.length = 0;
  Object.values(nativeMocks().music).forEach((v) => {
    if (typeof v === 'function' && v.mockClear) v.mockClear();
  });
});

describe('MusicPlayer handle (FG-1.3)', () => {
  test('getState is live for a handle captured before any emission', () => {
    const h = mountPlayer();
    const captured = h.handle();
    expect(captured.getState().status).toBe('idle');

    emitNative(MUSIC_EVENTS.STATE, stateEvent(state({ status: 'playing', position: 17 })));

    // The regression: `getState: () => state` closed over the mount-time value.
    expect(captured.getState().status).toBe('playing');
    expect(captured.getState().position).toBe(17);
    h.unmount();
  });

  test('getQueue is live for a handle captured before any emission', () => {
    const h = mountPlayer();
    const captured = h.handle();
    expect(captured.getQueue().tracks).toEqual(tracks);

    emitNative(MUSIC_EVENTS.TRACK_CHANGE, { index: 1, id: 'b' });

    expect(captured.getQueue().index).toBe(1);
    h.unmount();
  });

  test('handle identity is stable across state changes', () => {
    const h = mountPlayer();
    const first = h.handle();

    emitNative(MUSIC_EVENTS.STATE, stateEvent(state({ status: 'ready' })));
    emitNative(MUSIC_EVENTS.PROGRESS, { position: 2, duration: 100 });
    emitNative(MUSIC_EVENTS.PROGRESS, { position: 4, duration: 100 });

    // Previously rebuilt on every emission, so any consumer holding it in a
    // dependency array re-ran its effects several times a second.
    expect(h.handle()).toBe(first);
    h.unmount();
  });

  test('controls delegate to the native music module', () => {
    const h = mountPlayer();
    const { music } = nativeMocks();

    h.handle().play();
    h.handle().next();
    h.handle().setShuffle(true);

    expect(music.play).toHaveBeenCalled();
    expect(music.next).toHaveBeenCalled();
    expect(music.setShuffle).toHaveBeenCalledWith(true);
    h.unmount();
  });
});

describe('MusicPlayer onEvent (FG-1.1 / FG-1.3)', () => {
  test('fires on progress ticks, not only on status changes', () => {
    const onEvent = jest.fn();
    const h = mountPlayer({ onEvent });

    emitNative(MUSIC_EVENTS.STATE, stateEvent(state({ status: 'playing' })));
    onEvent.mockClear();

    emitNative(MUSIC_EVENTS.PROGRESS, { position: 33, duration: 240 });

    // The regression: the effect was gated on `state.status`, which a progress
    // tick does not change, so this reported nothing and a progress bar bound to
    // `onEvent` sat at 0 for the whole track.
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'state',
        state: expect.objectContaining({ position: 33, duration: 240 }),
      })
    );
    h.unmount();
  });

  test('an inline onEvent callback does not cause an infinite render loop', () => {
    // Regression guard for the loop actually hit while fixing this: with
    // `onEvent` in the effect deps, an inline arrow got a new identity each
    // render, the effect re-ran, it called back into the parent, and the
    // parent's setState re-rendered. React bailed out with
    // "Maximum update depth exceeded".
    let calls = 0;
    const Wrapper = () => {
      const [, force] = React.useState(0);
      return React.createElement(MusicPlayer, {
        tracks,
        onEvent: () => {
          calls += 1;
          // Hard cap: an uncapped loop makes the test *hang* rather than fail,
          // which is useless in CI and leaves the run with no verdict. Capping
          // turns the loop into a fast, legible assertion failure instead.
          if (calls < 200) force((n) => n + 1);
        },
      } as any);
    };

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(Wrapper));
    });
    emitNative(MUSIC_EVENTS.STATE, stateEvent(state({ status: 'playing' })));
    emitNative(MUSIC_EVENTS.PROGRESS, { position: 1, duration: 100 });

    // One call per genuine state change: mount, plus one per emission. A loop
    // would saturate the cap.
    expect(calls).toBeLessThan(10);
    act(() => { renderer.unmount(); });
  });
});
