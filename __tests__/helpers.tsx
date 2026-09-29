/**
 * Shared helpers for hook / component tests.
 *
 * `react-test-renderer` has no `renderHook` (that lives in
 * @testing-library/react-hooks / react-native), so this is a minimal
 * equivalent: render a probe component, read the hook's latest return value out
 * of a mutable box, and drive updates through `act`.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import type { PlaybackState } from '../src/types';

export interface RenderHookResult<T> {
  /** Latest value returned by the hook. Mutates in place across renders. */
  result: { current: T };
  /** Re-renders the probe. */
  rerender: () => void;
  unmount: () => void;
  /** Runs `fn` inside `act`, so resulting state updates are flushed. */
  act: (fn: () => void) => void;
  /**
   * Like `act`, but also drains the microtask queue.
   *
   * Needed wherever a hook resolves a source asynchronously before touching the
   * media element — the web players assign `src` inside a promise callback
   * (see to-be-done.md FG-2.2), so a synchronous `act` returns before the
   * element has been told what to play.
   */
  actAsync: (fn?: () => void | Promise<void>) => Promise<void>;
}

/**
 * Microtask ticks to drain after the callback.
 *
 * Three, not one: `slot.load()` awaits `resolveWebSource`, whose `.then` then
 * assigns the URL, which is itself followed by a state update. A single tick
 * lands between those steps and makes the assertions read as flaky.
 */
const MICRO_TASK_TICKS = 4;

export function renderHook<T>(useHook: () => T): RenderHookResult<T> {
  const result = { current: undefined as unknown as T };

  function Probe() {
    result.current = useHook();
    return null;
  }

  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });

  return {
    result,
    rerender: () => act(() => { renderer.update(React.createElement(Probe)); }),
    unmount: () => act(() => { renderer.unmount(); }),
    act: (fn: () => void) => act(fn),
    actAsync: async (fn?: () => void | Promise<void>) => {
      await act(async () => {
        if (fn) await fn();
        for (let i = 0; i < MICRO_TASK_TICKS; i++) await Promise.resolve();
      });
    },
  };
}

/** Native modules are reset between tests so call counts don't leak. */
export function nativeMocks() {
  return (global as any).__ompNativeMocks as {
    music: any;
    audio: any;
    cache: any;
  };
}

/**
 * Emits a native event the way the platform would.
 *
 * `NativeEventEmitter` on iOS bridges through `RCTDeviceEventEmitter`, so
 * emitting on `DeviceEventEmitter` reaches the hook's listeners for real rather
 * than through a stub.
 */
export function emitNative(eventName: string, payload?: unknown): void {
  act(() => {
    DeviceEventEmitter.emit(eventName, payload);
  });
}

export function stateEvent(state: Partial<PlaybackState>): { stateJson: string } {
  return { stateJson: JSON.stringify(state) };
}
