/**
 * `useRemoteControls.web` tests (FG-2.3).
 *
 * The mapping from `MediaSessionAction` to `RemoteCommand` is the contract that
 * lets the same consumer code run on all three platforms, so it is asserted
 * action by action rather than by "it did not throw". A lock-screen button that
 * fires the wrong command is a working feature that is still wrong.
 */
import { renderHook } from './helpers';
import { useRemoteControls } from '../src/hooks/useRemoteControls.web';
import type { RemoteCommand } from '../src/types';

type Handler = (details?: unknown) => void;

let handlers: Map<string, Handler | null>;
let setActionHandlerCalls: string[];

function installSession(opts: { unsupported?: string[] } = {}) {
  handlers = new Map();
  setActionHandlerCalls = [];
  const unsupported = new Set(opts.unsupported ?? []);
  (globalThis as any).navigator = {
    mediaSession: {
      setActionHandler(action: string, handler: unknown) {
        setActionHandlerCalls.push(action);
        if (unsupported.has(action)) throw new TypeError(`Unsupported: ${action}`);
        handlers.set(action, (handler as Handler) ?? null);
      },
      setPositionState() {},
      metadata: null,
    },
  };
}

/** Fire a registered action the way the browser would. */
function fire(action: string, details?: unknown) {
  const h = handlers.get(action);
  if (typeof h !== 'function') throw new Error(`no handler registered for '${action}'`);
  h(details);
}

function mount(onCommand: (c: RemoteCommand, p?: Record<string, unknown>) => void,
              getState?: () => { position?: number } | null) {
  return renderHook(() => useRemoteControls(onCommand, getState));
}

afterEach(() => {
  delete (globalThis as any).navigator;
});

beforeEach(() => {
  installSession();
});

describe('useRemoteControls.web — command mapping', () => {
  it('maps each transport action to its RemoteCommand', () => {
    const seen: RemoteCommand[] = [];
    mount((c) => seen.push(c));

    for (const action of ['play', 'pause', 'nexttrack', 'previoustrack', 'stop']) {
      fire(action);
    }
    expect(seen).toEqual(['play', 'pause', 'next', 'previous', 'stop']);
  });

  it('turns a seekbackward offset into an absolute position', () => {
    const calls: Array<[RemoteCommand, unknown]> = [];
    mount((c, p) => calls.push([c, p]), () => ({ position: 55 }));

    // The browser sends a delta, not a target, so the hook has to add the
    // current position itself — the native platforms emit an absolute one.
    fire('seekbackward', { seekOffset: 10 });
    expect(calls).toEqual([['seek', { position: 45 }]]);
  });

  it('turns a seekforward offset into an absolute position', () => {
    const calls: Array<[RemoteCommand, unknown]> = [];
    mount((c, p) => calls.push([c, p]), () => ({ position: 55 }));
    fire('seekforward', { seekOffset: 15 });
    expect(calls).toEqual([['seek', { position: 70 }]]);
  });

  it('passes a seekto target straight through', () => {
    const calls: Array<[RemoteCommand, unknown]> = [];
    mount((c, p) => calls.push([c, p]), () => ({ position: 55 }));
    fire('seekto', { seekTime: 12 });
    expect(calls).toEqual([['seek', { position: 12 }]]);
  });

  it('defaults the seek step to 10s when the browser sends no offset', () => {
    const calls: Array<[RemoteCommand, unknown]> = [];
    mount((c, p) => calls.push([c, p]), () => ({ position: 100 }));
    fire('seekbackward');
    expect(calls).toEqual([['seek', { position: 90 }]]);
  });

  it('never seeks to a negative position', () => {
    const calls: Array<[RemoteCommand, unknown]> = [];
    mount((c, p) => calls.push([c, p]), () => ({ position: 3 }));
    fire('seekbackward', { seekOffset: 30 });
    expect(calls).toEqual([['seek', { position: 0 }]]);
  });

  it('ignores a seekto with a non-finite time', () => {
    const calls: RemoteCommand[] = [];
    mount((c) => calls.push(c));
    // A malformed detail must not seek to NaN.
    fire('seekto', { seekTime: NaN });
    fire('seekto', {});
    expect(calls).toEqual([]);
  });

  it('treats a missing getState as position 0 rather than crashing', () => {
    const calls: Array<[RemoteCommand, unknown]> = [];
    mount((c, p) => calls.push([c, p]));
    fire('seekbackward', { seekOffset: 10 });
    expect(calls).toEqual([['seek', { position: 0 }]]);
  });

  it('survives a getState that throws', () => {
    const calls: Array<[RemoteCommand, unknown]> = [];
    mount(
      (c, p) => calls.push([c, p]),
      () => {
        throw new Error('component unmounted');
      }
    );
    expect(() => fire('seekforward', { seekOffset: 5 })).not.toThrow();
    expect(calls).toEqual([['seek', { position: 5 }]]);
  });
});

describe('useRemoteControls.web — registration lifecycle', () => {
  it('registers all eight actions', () => {
    mount(() => undefined);
    expect(setActionHandlerCalls.sort()).toEqual(
      [
        'nexttrack',
        'pause',
        'play',
        'previoustrack',
        'seekbackward',
        'seekforward',
        'seekto',
        'stop',
      ].sort()
    );
  });

  it('does not re-register when the callback identity changes', () => {
    // `onCommand` is almost always an inline arrow, so re-registering on every
    // render would tear the session handlers down and back up several times a
    // second during playback.
    //
    // The fresh closure per render is the point: with a stable callback this
    // assertion passes even if the effect depends on it, so it would pin
    // nothing.
    const hook = renderHook(() => {
      useRemoteControls(() => undefined);
    });
    const before = setActionHandlerCalls.length;
    expect(before).toBe(8);
    hook.rerender();
    hook.rerender();
    expect(setActionHandlerCalls).toHaveLength(before);
  });

  it('uses the latest callback without re-registering', () => {
    // The handler is registered once, but it must call the *newest* closure.
    // Otherwise a consumer that captures state in `onCommand` silently drives
    // a stale version of its own handler.
    const seen: string[] = [];
    let which: 'first' | 'second' = 'first';
    const hook = renderHook(() => {
      useRemoteControls((c) => seen.push(`${which}:${c}`));
    });
    which = 'second';
    hook.rerender();
    fire('play');
    expect(seen).toEqual(['second:play']);
  });

  it('clears its handlers on unmount', () => {
    const hook = mount(() => undefined);
    expect(typeof handlers.get('play')).toBe('function');
    hook.unmount();
    expect(handlers.get('play')).toBeNull();
  });

  it('registers what it can when a browser lacks some actions', () => {
    installSession({ unsupported: ['seekto', 'stop'] });
    const seen: RemoteCommand[] = [];
    mount((c) => seen.push(c));
    // Present, and working...
    fire('play');
    expect(seen).toEqual(['play']);
    // ...absent ones are simply not registered.
    expect(handlers.has('seekto')).toBe(false);
  });
});

describe('useRemoteControls.web — unsupported environments', () => {
  it('is a silent no-op without navigator.mediaSession', () => {
    delete (globalThis as any).navigator;
    let called = false;
    // Must not throw: cross-platform code calls this unconditionally, and this
    // replaces a previous stub that was a no-op for the same reason.
    expect(() => mount(() => { called = true; })).not.toThrow();
    expect(called).toBe(false);
    expect(setActionHandlerCalls).toHaveLength(0);
  });

  it('is a silent no-op when mediaSession is present but empty', () => {
    (globalThis as any).navigator = { mediaSession: undefined };
    expect(() => mount(() => undefined)).not.toThrow();
  });
});
