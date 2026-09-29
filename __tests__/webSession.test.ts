/**
 * Web media session tests (FG-2.3).
 *
 * `navigator.mediaSession` is a document singleton and does not exist in the Node
 * test environment, so each test installs a recording double. The doubles are
 * deliberately *strict* — the real API throws on values it considers invalid —
 * because the two failure modes that matter here (an unsupported action, and a
 * `NaN` duration from a media element that has not loaded metadata) only
 * surface as thrown `TypeError`s in real browsers.
 */
import {
  applyWebSessionHandlers,
  applyWebSessionMetadata,
  applyWebSessionPositionState,
  clearWebSession,
  isWebSessionSupported,
} from '../src/utils/webSession';
import type { Track } from '../src/types';

interface RecordingSession {
  handlers: Map<string, ((details?: unknown) => void) | null>;
  metadata: unknown;
  positionState: unknown;
  /** Actions this browser pretends not to support. */
  unsupported: Set<string>;
  setActionHandlerCalls: string[];
}

let rec: RecordingSession;
let metadataCtorCalls: unknown[];
let setPositionStateCalls: number;

function installSession() {
  rec = {
    handlers: new Map(),
    metadata: null,
    positionState: null,
    unsupported: new Set(),
    setActionHandlerCalls: [],
  };
  metadataCtorCalls = [];
  setPositionStateCalls = 0;

  (globalThis as any).navigator = {
    mediaSession: {
      set metadata(value: unknown) {
        rec.metadata = value;
      },
      get metadata() {
        return rec.metadata;
      },
      setActionHandler(action: string, handler: unknown) {
        rec.setActionHandlerCalls.push(action);
        if (rec.unsupported.has(action)) {
          throw new TypeError(`Unsupported action: ${action}`);
        }
        rec.handlers.set(action, (handler as any) ?? null);
      },
      setPositionState(state: unknown) {
        setPositionStateCalls++;
        // Mirrors the real spec: throws rather than ignoring bad values.
        const s = state as { duration: number; position: number; playbackRate: number };
        if (!Number.isFinite(s.duration) || s.duration <= 0) {
          throw new TypeError('duration must be a finite positive number');
        }
        if (s.position < 0) throw new TypeError('position must not be negative');
        if (s.position > s.duration) throw new TypeError('position exceeds duration');
        rec.positionState = state;
      },
    },
  };

  (globalThis as any).MediaMetadata = class {
    constructor(init: unknown) {
      metadataCtorCalls.push(init);
    }
  };
}

function removeSession() {
  delete (globalThis as any).navigator;
  delete (globalThis as any).MediaMetadata;
}

const track: Track = {
  id: 't1',
  source: { uri: 'https://cdn.test/t1.mp3' },
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  artwork: 'https://cdn.test/cover.png',
};

beforeEach(installSession);
afterEach(removeSession);

describe('isWebSessionSupported', () => {
  it('is true when navigator.mediaSession is an object', () => {
    expect(isWebSessionSupported()).toBe(true);
  });

  it('is false when there is no navigator at all (SSR)', () => {
    // Rendering on a server must not touch `navigator`; that is the whole
    // reason the check exists.
    delete (globalThis as any).navigator;
    expect(isWebSessionSupported()).toBe(false);
    expect(() => applyWebSessionMetadata(track)).not.toThrow();
    expect(() =>
      applyWebSessionPositionState({ duration: 10, position: 1, rate: 1 })
    ).not.toThrow();
    expect(
      typeof applyWebSessionHandlers({ play: () => undefined })
    ).toBe('function');
  });

  it('is false when the property exists but is not an object', () => {
    (globalThis as any).navigator = { mediaSession: undefined };
    expect(isWebSessionSupported()).toBe(false);
  });
});

describe('applyWebSessionHandlers', () => {
  it('registers a handler per action', () => {
    applyWebSessionHandlers({ play: () => undefined, pause: () => undefined });
    expect(typeof rec.handlers.get('play')).toBe('function');
    expect(typeof rec.handlers.get('pause')).toBe('function');
  });

  it('the disposer clears only what it set', () => {
    const other = jest.fn();
    (globalThis as any).navigator.mediaSession.setActionHandler('play', other);

    const dispose = applyWebSessionHandlers({ nexttrack: () => undefined });
    dispose();

    // `nexttrack` (ours) is gone; `play` (someone else's) is untouched. Two
    // components mounting in sequence must not tear each other down.
    expect(rec.handlers.get('nexttrack')).toBeNull();
    expect(rec.handlers.get('play')).toBe(other);
  });

  it('survives an action this browser does not support', () => {
    // Firefox and older Safari throw for actions they do not implement. One
    // unsupported action must not cost the other seven.
    rec.unsupported.add('seekto');
    const handlers = { play: jest.fn(), seekto: jest.fn(), pause: jest.fn() };

    let dispose!: () => void;
    expect(() => {
      dispose = applyWebSessionHandlers(handlers);
    }).not.toThrow();

    expect(typeof rec.handlers.get('play')).toBe('function');
    expect(typeof rec.handlers.get('pause')).toBe('function');
    // The unsupported one was attempted, and skipped rather than registered.
    expect(rec.setActionHandlerCalls).toContain('seekto');
    expect(rec.handlers.has('seekto')).toBe(false);

    // And its disposer must not throw either.
    expect(() => dispose()).not.toThrow();
  });

  it('ignores non-function values', () => {
    applyWebSessionHandlers({ play: undefined as any });
    expect(rec.setActionHandlerCalls).not.toContain('play');
  });
});

describe('applyWebSessionMetadata', () => {
  it('publishes title, artist, album and artwork from the track', () => {
    applyWebSessionMetadata(track);
    expect(metadataCtorCalls).toHaveLength(1);
    expect(metadataCtorCalls[0]).toEqual({
      title: 'Title',
      artist: 'Artist',
      album: 'Album',
      artwork: [{ src: 'https://cdn.test/cover.png' }],
    });
  });

  it('falls back to the id when there is no title', () => {
    applyWebSessionMetadata({ id: 't9', source: { uri: 'x' } });
    expect(metadataCtorCalls[0]).toMatchObject({ title: 't9' });
  });

  it('omits artwork rather than passing undefined', () => {
    applyWebSessionMetadata({ id: 't9', source: { uri: 'x' } });
    expect((metadataCtorCalls[0] as any).artwork).toBeUndefined();
  });

  it('clears to null when the track goes away', () => {
    applyWebSessionMetadata(track);
    applyWebSessionMetadata(null);
    expect(rec.metadata).toBeNull();
  });

  it('does not throw when MediaMetadata is missing', () => {
    delete (globalThis as any).MediaMetadata;
    expect(() => applyWebSessionMetadata(track)).not.toThrow();
  });
});

describe('applyWebSessionPositionState', () => {
  it('publishes a valid position', () => {
    applyWebSessionPositionState({ duration: 200, position: 55, rate: 1 });
    expect(rec.positionState).toEqual({
      duration: 200,
      playbackRate: 1,
      position: 55,
    });
  });

  it('skips a non-finite or zero duration', () => {
    // A media element reports NaN until metadata loads, and a real throw here
    // would break every progress tick.
    for (const duration of [NaN, Infinity, 0, -5]) {
      expect(() =>
        applyWebSessionPositionState({ duration, position: 1, rate: 1 })
      ).not.toThrow();
    }
    expect(rec.positionState).toBeNull();
    // The call *count* is what distinguishes "guarded" from "called and caught":
    // the `try`/`catch` around `setPositionState` makes both look identical from
    // the outside, so asserting only on the absence of a throw would pass even
    // with the guard deleted. Not calling it also matters on an engine that
    // accepts the value instead of rejecting it.
    expect(setPositionStateCalls).toBe(0);
  });

  it('does call setPositionState for a valid position', () => {
    // The counterpart to the count assertion above, so the count is not zero
    // for an unrelated reason.
    applyWebSessionPositionState({ duration: 10, position: 1, rate: 1 });
    expect(setPositionStateCalls).toBe(1);
  });

  it('clamps a negative position to zero', () => {
    applyWebSessionPositionState({ duration: 100, position: -3, rate: 1 });
    expect((rec.positionState as any).position).toBe(0);
  });

  it('clamps a position past duration', () => {
    // A live position can overshoot duration by a frame, which the real API
    // rejects outright.
    applyWebSessionPositionState({ duration: 100, position: 104, rate: 1 });
    expect((rec.positionState as any).position).toBe(100);
  });

  it('replaces a non-positive or non-finite rate with 1', () => {
    applyWebSessionPositionState({ duration: 100, position: 1, rate: 0 });
    expect((rec.positionState as any).playbackRate).toBe(1);
    applyWebSessionPositionState({ duration: 100, position: 1, rate: NaN });
    expect((rec.positionState as any).playbackRate).toBe(1);
  });
});

describe('clearWebSession', () => {
  it('clears every handler it knows about and drops the metadata', () => {
    applyWebSessionMetadata(track);
    clearWebSession();
    for (const action of [
      'play',
      'pause',
      'previoustrack',
      'nexttrack',
      'seekbackward',
      'seekforward',
      'seekto',
      'stop',
    ]) {
      expect(rec.handlers.get(action)).toBeNull();
    }
    expect(rec.metadata).toBeNull();
  });

  it('does not throw when the session refuses to clear', () => {
    (globalThis as any).navigator.mediaSession.setActionHandler = () => {
      throw new TypeError('nope');
    };
    expect(() => clearWebSession()).not.toThrow();
  });
});
