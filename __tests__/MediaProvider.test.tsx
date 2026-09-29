/**
 * FG-1.1 — `MediaProvider` published `controls: ref.current as MusicPlayerHandle`.
 *
 * Refs attach during *commit*, after the render that builds the context value,
 * so `useMedia().controls` was `null` on the first render and stayed null
 * unless something unrelated forced a second render. `state` was seeded with
 * `ref.current?.getState() ?? ({} as PlaybackState)` — an empty object, so
 * `state.status` was `undefined` — and only ever updated when
 * `MusicPlayer`'s `onEvent` fired, which was gated on `state.status` and so
 * never fired for progress.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MediaProvider, useMedia } from '../src/context/MediaProvider';
import { MUSIC_EVENTS } from '../src/core/Events';
import { INITIAL_STATE } from '../src/utils/media';
import { nativeMocks, emitNative, stateEvent } from './helpers';
import type { MediaContextValue } from '../src/context/MediaProvider';
import type { Track } from '../src/types';

const tracks: Track[] = [
  { id: 'a', source: { uri: 'https://cdn.test/a.mp3' } },
  { id: 'b', source: { uri: 'https://cdn.test/b.mp3' } },
];

/**
 * Renders a provider with a probe child, recording the context value seen on
 * *every* render.
 *
 * Recording all of them (rather than keeping only the latest) is what makes
 * these regression tests meaningful: the original bug was only visible on the
 * first render, before the ref attached, and a "latest value" assertion passes
 * against the broken code as soon as any re-render repopulates it.
 */
function renderProvider(props: Partial<React.ComponentProps<typeof MediaProvider>> = {}) {
  const renders: MediaContextValue[] = [];

  function Probe() {
    renders.push(useMedia());
    return null;
  }

  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        MediaProvider,
        { initialTracks: props.initialTracks ?? tracks, ...props },
        React.createElement(Probe)
      )
    );
  });

  return {
    /** Context as seen on the very first render — the buggy case. */
    get first() {
      return renders[0];
    },
    /** Context as seen on the most recent render. */
    get current() {
      return renders[renders.length - 1];
    },
    renderCount: () => renders.length,
    unmount: () => act(() => { renderer.unmount(); }),
  };
}

beforeEach(() => {
  nativeMocks().music.__listenerCalls.length = 0;
  Object.values(nativeMocks().music).forEach((v) => {
    if (typeof v === 'function' && v.mockClear) v.mockClear();
  });
});

describe('MediaProvider controls (FG-1.1)', () => {
  test('controls is a usable object on the very first render', () => {
    const h = renderProvider();

    // Nothing re-rendered, so this is genuinely the first-pass value.
    expect(h.renderCount()).toBe(1);
    // The regression: `controls: ref.current as MusicPlayerHandle` read the ref
    // during render, before commit attached it, so this was `null`.
    expect(h.first.controls).toBeTruthy();
    expect(typeof h.first.controls.play).toBe('function');
    expect(typeof h.first.controls.next).toBe('function');
    h.unmount();
  });

  test('controls delegates to the native music module', () => {
    const h = renderProvider();
    const { music } = nativeMocks();

    h.current.controls.play();
    h.current.controls.next();
    h.current.controls.setRepeatMode('queue');
    h.current.controls.setVolume(0.3);

    expect(music.play).toHaveBeenCalled();
    expect(music.next).toHaveBeenCalled();
    expect(music.setRepeatMode).toHaveBeenCalledWith('queue');
    expect(music.setVolume).toHaveBeenCalledWith(0.3);
    h.unmount();
  });

  test('controls is callable even if nothing ever re-rendered', () => {
    const h = renderProvider();
    h.first.controls.play();
    expect(nativeMocks().music.play).toHaveBeenCalled();
    h.unmount();
  });

  test('controls identity is stable across renders', () => {
    const h = renderProvider();
    const first = h.first.controls;
    emitNative(MUSIC_EVENTS.STATE, stateEvent({ ...INITIAL_STATE, status: 'playing' }));
    expect(h.current.controls).toBe(first);
    h.unmount();
  });

  test('toggle pauses when playing and plays otherwise', () => {
    const h = renderProvider();
    const { music } = nativeMocks();

    // Not playing -> plays. Previously `getState()` returned undefined (null
    // ref), so every toggle called play() and pause was unreachable.
    h.current.toggle();
    expect(music.play).toHaveBeenCalledTimes(1);

    emitNative(
      MUSIC_EVENTS.STATE,
      stateEvent({ ...INITIAL_STATE, status: 'playing' })
    );
    music.pause.mockClear();

    h.current.toggle();
    expect(music.pause).toHaveBeenCalledTimes(1);
    expect(music.play).toHaveBeenCalledTimes(1);
    h.unmount();
  });
});

describe('MediaProvider state (FG-1.1)', () => {
  test('state starts as INITIAL_STATE, not an empty object', () => {
    const h = renderProvider();

    // The regression: seeded with `ref.current?.getState() ?? ({} as
    // PlaybackState)`, so `.status` was undefined and every field read came
    // back undefined.
    expect(h.renderCount()).toBe(1);
    expect(h.first.state).toEqual(INITIAL_STATE);
    expect(h.first.state.status).toBe('idle');
    h.unmount();
  });

  test('state follows native status changes', () => {
    const h = renderProvider();

    emitNative(
      MUSIC_EVENTS.STATE,
      stateEvent({ ...INITIAL_STATE, status: 'playing', position: 30 })
    );

    expect(h.current.state.status).toBe('playing');
    expect(h.current.state.position).toBe(30);
    h.unmount();
  });

  test('position tracks progress — previously frozen for the whole track', () => {
    const h = renderProvider();

    emitNative(MUSIC_EVENTS.STATE, stateEvent({ ...INITIAL_STATE, status: 'playing' }));
    emitNative(MUSIC_EVENTS.PROGRESS, { position: 42.5, duration: 200 });

    // MusicPlayer's onEvent was gated on `state.status`, so a progress tick —
    // which changes `state` but not `state.status` — never reached the context.
    expect(h.current.state.position).toBe(42.5);
    expect(h.current.state.duration).toBe(200);
    h.unmount();
  });

  test('queue reflects the tracks passed in', () => {
    const h = renderProvider();
    expect(h.first.queue.tracks).toEqual(tracks);
    expect(h.first.queue.index).toBe(0);
    h.unmount();
  });

  test('setTracks replaces the queue and resets the index', () => {
    const h = renderProvider();
    const next: Track[] = [{ id: 'z', source: { uri: 'https://cdn.test/z.mp3' } }];

    act(() => h.current.setTracks(next));

    expect(h.current.queue.tracks).toEqual(next);
    expect(nativeMocks().music.setQueue).toHaveBeenCalled();
    h.unmount();
  });
});
