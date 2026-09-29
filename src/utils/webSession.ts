import type { Track } from '../types';

/**
 * The one place that talks to `navigator.mediaSession`.
 *
 * `navigator.mediaSession` is a **document singleton** — there is exactly one per
 * page, and `setActionHandler` overwrites whatever was there. So every caller
 * goes through this module rather than touching `navigator.mediaSession`
 * directly; otherwise `useRemoteControls` and `useMusicPlayer` would silently
 * fight over the same `'play'` handler, last-write-wins, with no error.
 *
 * Everything here is feature-detected and degrades to a no-op. Safari and
 * Firefox implement `mediaSession` partially or not at all, and the whole
 * function set has to be safe to call on a server, where `navigator` does not
 * exist at all.
 */

/** Subset of `MediaSessionAction` this library registers. */
export type WebSessionAction =
  | 'play'
  | 'pause'
  | 'previoustrack'
  | 'nexttrack'
  | 'seekbackward'
  | 'seekforward'
  | 'seekto'
  | 'stop';

/** Detail objects the media session passes to seek handlers. */
export interface SeekOffsetDetails {
  seekOffset: number;
}
export interface SeekTimeDetails {
  seekTime: number;
}

export type WebSessionHandlers = {
  [K in WebSessionAction]?: (details?: unknown) => void;
};

/**
 * `false` on a server, and on any browser without the API.
 *
 * Checked via `in` rather than truthiness so a browser that ships the property
 * but leaves it `undefined` is handled the same as one without it.
 */
export function isWebSessionSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as any).mediaSession === 'object' &&
    (navigator as any).mediaSession !== null
  );
}

function session(): any | null {
  return isWebSessionSupported() ? (navigator as any).mediaSession : null;
}

/**
 * Registers action handlers.
 *
 * Returns a disposer that clears **only** the handlers this call set, so two
 * components mounting and unmounting in sequence do not leave the session
 * pointing at a dead closure. Each `setActionHandler` is individually guarded:
 * implementations disagree about whether an action they do not support throws
 * or is ignored, and one unsupported action must not cost the other seven.
 */
export function applyWebSessionHandlers(handlers: WebSessionHandlers): () => void {
  const s = session();
  if (!s) return () => undefined;

  const registered: WebSessionAction[] = [];
  for (const action of Object.keys(handlers) as WebSessionAction[]) {
    const handler = handlers[action];
    if (typeof handler !== 'function') continue;
    try {
      s.setActionHandler(action, handler);
      registered.push(action);
    } catch {
      // Unsupported action on this browser. Nothing to do — the rest still work.
    }
  }

  return () => {
    for (const action of registered) {
      try {
        s.setActionHandler(action, null);
      } catch {
        // As above: clearing must never throw during unmount.
      }
    }
  };
}

/**
 * Publishes the now-playing track.
 *
 * This is the first consumer of `Track.artwork` on any platform. On native it is
 * decoded and then discarded (`to-be-done.md` FG-6.4); the web session actually
 * renders it, which is what makes the field worth filling in.
 */
export function applyWebSessionMetadata(track: Track | null | undefined): void {
  const s = session();
  if (!s) return;

  if (!track) {
    try {
      s.metadata = null;
    } catch {
      // Not all implementations allow clearing.
    }
    return;
  }

  try {
    s.metadata = new (globalThis as any).MediaMetadata({
      title: track.title ?? track.id,
      artist: track.artist ?? '',
      album: track.album ?? '',
      // A bare URL string is accepted by Chrome; other engines want
      // `MediaImage[]`. Passing the string is the interoperable form and is
      // ignored where unsupported.
      artwork: track.artwork ? [{ src: track.artwork }] : undefined,
    });
  } catch {
    // No `MediaMetadata` constructor, or a malformed artwork URL. The session
    // keeps whatever metadata it had rather than breaking playback.
  }
}

/**
 * Publishes the scrubber position.
 *
 * `setPositionState` throws a `TypeError` if `duration` is not a finite number
 * greater than zero, or if `position` is negative or greater than `duration`.
 * Media elements report `NaN` for duration until metadata loads, and a live
 * position can legitimately overshoot duration by a frame, so the values are
 * clamped rather than passed through.
 */
export function applyWebSessionPositionState(state: {
  duration: number;
  position: number;
  rate: number;
}): void {
  const s = session();
  if (!s) return;

  const { duration, position, rate } = state;
  if (!Number.isFinite(duration) || duration <= 0) return;

  const safePosition = Math.min(Math.max(position, 0), duration);
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;

  try {
    s.setPositionState?.({
      duration,
      playbackRate: safeRate,
      position: safePosition,
    });
  } catch {
    // Safari has historically thrown here for live / unknown-duration streams.
  }
}

/** Clears handlers, metadata and position state. Used on unmount. */
export function clearWebSession(): void {
  const s = session();
  if (!s) return;
  try {
    s.setActionHandler?.('play', null);
    s.setActionHandler?.('pause', null);
    s.setActionHandler?.('previoustrack', null);
    s.setActionHandler?.('nexttrack', null);
    s.setActionHandler?.('seekbackward', null);
    s.setActionHandler?.('seekforward', null);
    s.setActionHandler?.('seekto', null);
    s.setActionHandler?.('stop', null);
  } catch {
    // Ignore: a session that refuses to clear is not worth failing unmount over.
  }
  applyWebSessionMetadata(null);
}
