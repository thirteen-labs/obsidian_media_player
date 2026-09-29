import { useEffect, useRef } from 'react';
import {
  applyWebSessionHandlers,
  isWebSessionSupported,
  type SeekOffsetDetails,
  type SeekTimeDetails,
  type WebSessionHandlers,
} from '../utils/webSession';
import type { RemoteCommand } from '../types';

export type { RemoteCommand };

/** Seek granularity, matching what a lock-screen scrubber sends. */
const SEEK_STEP_SECONDS = 10;

/**
 * Web implementation: bridges `navigator.mediaSession` to `onCommand`.
 *
 * Replaces a previous no-op stub, so on web this hook now actually fires. The
 * browser's surface is `MediaSessionAction` handlers rather than an event
 * emitter, so unlike the native hook there is no subscription to clean up —
 * the disposer returned by `applyWebSessionHandlers` clears the handlers it set.
 *
 * A `MediaSessionAction` maps onto `RemoteCommand` as follows, which is what lets
 * the same consumer code run on all three platforms:
 *
 * | MediaSession | RemoteCommand |
 * |---|---|
 * | `play`, `pause` | `play`, `pause` |
 * | `nexttrack`, `previoustrack` | `next`, `previous` |
 * | `seekbackward`, `seekforward`, `seekto` | `seek` with `{ position }` |
 * | `stop` | `stop` |
 *
 * The three seek actions collapse into one command because the native platforms
 * emit a single seek event carrying an absolute position. `seekbackward` and
 * `seekforward` therefore need the current position to turn an offset into one,
 * so `getState` is passed in.
 *
 * @param onCommand Receives the command plus an optional payload.
 * @param getState Optional, used only to resolve `seekbackward` / `seekforward`
 *   into an absolute position. Without it those two degrade to `position: 0`,
 *   which is wrong, so pass it unless the consumer handles them itself.
 */
export function useRemoteControls(
  onCommand: (command: RemoteCommand, payload?: Record<string, unknown>) => void,
  getState?: () => { position?: number } | null
): void {
  // Both are read through refs so re-registering on every render is unnecessary —
  // `onCommand` is usually an inline arrow, and depending on it would tear the
  // session handlers down and back up several times a second during playback.
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;
  const getStateRef = useRef(getState);
  getStateRef.current = getState;

  useEffect(() => {
    if (!isWebSessionSupported()) {
      // Firefox without mediaSession, or a browser that has not shipped it. A
      // no-op, not an error: cross-platform code calls this unconditionally.
      return;
    }

    const currentPosition = () => {
      try {
        return getStateRef.current?.()?.position ?? 0;
      } catch {
        return 0;
      }
    };

    const handlers: WebSessionHandlers = {
      play: () => onCommandRef.current('play'),
      pause: () => onCommandRef.current('pause'),
      nexttrack: () => onCommandRef.current('next'),
      previoustrack: () => onCommandRef.current('previous'),
      stop: () => onCommandRef.current('stop'),
      seekbackward: (details) => {
        const offset = (details as SeekOffsetDetails)?.seekOffset ?? SEEK_STEP_SECONDS;
        onCommandRef.current('seek', {
          position: Math.max(0, currentPosition() - offset),
        });
      },
      seekforward: (details) => {
        const offset = (details as SeekOffsetDetails)?.seekOffset ?? SEEK_STEP_SECONDS;
        onCommandRef.current('seek', { position: currentPosition() + offset });
      },
      seekto: (details) => {
        const time = (details as SeekTimeDetails)?.seekTime;
        if (typeof time !== 'number' || !Number.isFinite(time)) return;
        onCommandRef.current('seek', { position: Math.max(0, time) });
      },
    };

    return applyWebSessionHandlers(handlers);
  }, []);
}
