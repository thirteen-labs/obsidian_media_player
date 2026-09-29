/**
 * FG-1.4 — `useMusicPlayer` subscribed to only 4 of the 6 events the native
 * modules emit, and hardcoded `removeListeners(4)`.
 *
 * Regression tests assert the subscription bookkeeping *and* the behaviour that
 * was silently missing: a finished queue and a player error.
 */
import { renderHook, nativeMocks, emitNative, stateEvent } from './helpers';
import { useMusicPlayer } from '../src/hooks/useMusicPlayer';
import { MUSIC_EVENTS } from '../src/core/Events';
import { INITIAL_STATE } from '../src/utils/media';
import { DownloadManager } from '../src/core/DownloadManager';

const ALL_EVENTS = Object.values(MUSIC_EVENTS);

// The native mocks are module-level singletons, so call history survives between
// tests. The `FG-1.4` describe below clears its own, but nothing cleared
// `music.setQueue` for the controls block — which is invisible to
// `toHaveBeenCalledWith` (it matches *any* call) and quietly wrong for any
// assertion that reads `mock.calls[0]`, since that is whichever test ran first.
beforeEach(() => {
  Object.values(nativeMocks().music).forEach((v) => {
    if (typeof v === 'function' && v.mockClear) v.mockClear();
  });
});

/**
 * `onRemoteCommand` is deliberately absent: it is owned by `useRemoteControls`,
 * which surfaces lock-screen / headset presses to the caller directly rather
 * than folding them into playback state. Every other emitted event is handled
 * here.
 */
const SUBSCRIBED_EVENTS = ALL_EVENTS.filter(
  (name) => name !== MUSIC_EVENTS.REMOTE_COMMAND
);

describe('useMusicPlayer event subscriptions (FG-1.4)', () => {
  beforeEach(() => {
    nativeMocks().music.__listenerCalls.length = 0;
    Object.values(nativeMocks().music).forEach((v) => {
      if (typeof v === 'function' && v.mockClear) v.mockClear();
    });
  });

  test('subscribes to every event except the one owned by useRemoteControls', () => {
    const { unmount } = renderHook(() => useMusicPlayer([]));
    const added = nativeMocks().music.__listenerCalls
      .filter(([kind]) => kind === 'add')
      .map(([, name]) => name);

    // The regression: onEnded and onError were never subscribed.
    expect(added).toEqual(SUBSCRIBED_EVENTS);
    expect(added).toContain(MUSIC_EVENTS.ENDED);
    expect(added).toContain(MUSIC_EVENTS.ERROR);
    unmount();
  });

  test('native listener bookkeeping balances, without double-counting', () => {
    const { unmount } = renderHook(() => useMusicPlayer([]));
    const calls = nativeMocks().music.__listenerCalls;
    const addsBefore = calls.filter(([kind]) => kind === 'add').length;
    expect(addsBefore).toBe(SUBSCRIBED_EVENTS.length);

    unmount();

    const removes = calls.filter(([kind]) => kind === 'remove');
    // Previously the hook both let NativeEventEmitter bracket each
    // subscription *and* called addListener/removeListeners by hand, so the
    // native side saw 12 adds and 7 removes for 6 listeners.
    expect(removes).toHaveLength(addsBefore);
    removes.forEach(([, count]) => expect(count).toBe(1));
  });
});

describe('useMusicPlayer state handling', () => {
  test('initial state is INITIAL_STATE', () => {
    const { result, unmount } = renderHook(() => useMusicPlayer([]));
    expect(result.current.state).toEqual(INITIAL_STATE);
    unmount();
  });

  test('onState replaces the snapshot', () => {
    const { result, unmount } = renderHook(() => useMusicPlayer([]));

    emitNative(
      MUSIC_EVENTS.STATE,
      stateEvent({ ...INITIAL_STATE, status: 'playing', position: 12 })
    );

    expect(result.current.state.status).toBe('playing');
    expect(result.current.state.position).toBe(12);
    unmount();
  });

  test('onProgress advances position and duration', () => {
    const { result, unmount } = renderHook(() => useMusicPlayer([]));

    emitNative(MUSIC_EVENTS.PROGRESS, { position: 7.5, duration: 120 });

    expect(result.current.state.position).toBe(7.5);
    expect(result.current.state.duration).toBe(120);
    unmount();
  });

  test('onEnded sets status to ended — the event that was previously dropped', () => {
    const { result, unmount } = renderHook(() => useMusicPlayer([]));

    emitNative(MUSIC_EVENTS.STATE, stateEvent({ ...INITIAL_STATE, duration: 90 }));
    expect(result.current.state.status).not.toBe('ended');

    emitNative(MUSIC_EVENTS.ENDED);

    // A finished queue was indistinguishable from a pause before.
    expect(result.current.state.status).toBe('ended');
    expect(result.current.state.position).toBe(90);
    unmount();
  });

  test('onError surfaces the message — previously a silent failure', () => {
    const { result, unmount } = renderHook(() => useMusicPlayer([]));

    emitNative(MUSIC_EVENTS.ERROR, { message: 'HTTP 403' });

    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toBe('HTTP 403');
    unmount();
  });

  test('onTrackChange updates the queue index', () => {
    const { result, unmount } = renderHook(() => useMusicPlayer([]));

    emitNative(MUSIC_EVENTS.TRACK_CHANGE, { index: 2, id: 'b' });

    expect(result.current.queue.index).toBe(2);
    unmount();
  });
});

describe('useMusicPlayer controls', () => {
  test('setQueue serialises tracks and updates local state optimistically', async () => {
    const { result, actAsync, unmount } = renderHook(() => useMusicPlayer([]));
    const tracks = [{ id: 'a', source: { uri: 'https://cdn.test/a.mp3' } }];

    await actAsync(() => result.current.controls.setQueue(tracks));

    // FG-5.1: setQueue now resolves cached URIs before passing to native.
    // The test track has no cached download, so the original URI is used.
    expect(nativeMocks().music.setQueue).toHaveBeenCalledWith(
      JSON.stringify(tracks)
    );
    expect(result.current.queue.tracks).toEqual(tracks);
    unmount();
  });

  test('setQueue resolves cached URIs for downloaded tracks', async () => {
    const { result, actAsync, unmount } = renderHook(() => useMusicPlayer([]));
    // Mock DownloadManager.resolveUri to return a local cached path
    const originalResolveUri = DownloadManager.resolveUri;
    ;(DownloadManager as any).resolveUri = async (id: string) => {
      if (id === 'a') return 'file:///path/to/cache/a.mp3';
      return null;
    };
    const tracks = [{ id: 'a', source: { uri: 'https://cdn.test/a.mp3' } }];

    await actAsync(() => result.current.controls.setQueue(tracks));

    // The cached URI should be used instead of the remote one
    expect(nativeMocks().music.setQueue).toHaveBeenCalledWith(
      JSON.stringify([{ id: 'a', source: { uri: 'file:///path/to/cache/a.mp3' } }])
    );
    unmount();
    // Restore original mock
    ;(DownloadManager as any).resolveUri = originalResolveUri;
  });

  // The `source` shape matters here, and getting it wrong is exactly the FG-5.1
  // bug: the first draft rewrote a *top-level* `uri`, which a `Track` does not
  // have, so the cached path went somewhere no load path reads.
  test('setQueue writes the cached uri into source.uri, not a top-level uri', async () => {
    const { result, actAsync, unmount } = renderHook(() => useMusicPlayer([]));
    const original = DownloadManager.resolveUri;
    ;(DownloadManager as any).resolveUri = async () => 'file:///cache/a.mp3';

    await actAsync(() =>
      result.current.controls.setQueue([
        { id: 'a', source: { uri: 'https://cdn.test/a.mp3' } },
      ])
    );

    const sent = JSON.parse(nativeMocks().music.setQueue.mock.calls[0][0] as string);
    expect(sent[0].source.uri).toBe('file:///cache/a.mp3');
    // No stray field: `Track` has no `uri`, so a top-level one is a bug even when
    // the rewrite also happens to be right.
    expect(sent[0].uri).toBeUndefined();
    unmount();
    ;(DownloadManager as any).resolveUri = original;
  });

  test('setQueue preserves the other MediaSource fields through the rewrite', async () => {
    const { result, actAsync, unmount } = renderHook(() => useMusicPlayer([]));
    const original = DownloadManager.resolveUri;
    ;(DownloadManager as any).resolveUri = async () => 'file:///cache/a.mp4';

    await actAsync(() =>
      result.current.controls.setQueue([
        {
          id: 'a',
          title: 'Title',
          source: {
            uri: 'https://cdn.test/a.mp4',
            type: 'progressive',
            headers: { Authorization: 'Bearer t' },
          },
        },
      ])
    );

    // Dropping these while rewriting the uri would silently break header-auth
    // playback the moment a download existed.
    const sent = JSON.parse(nativeMocks().music.setQueue.mock.calls[0][0] as string);
    expect(sent[0].source).toEqual({
      uri: 'file:///cache/a.mp4',
      type: 'progressive',
      headers: { Authorization: 'Bearer t' },
    });
    expect(sent[0].title).toBe('Title');
    unmount();
    ;(DownloadManager as any).resolveUri = original;
  });

  test('setQueue skips the cache lookup for a cacheable:false track', async () => {
    const { result, actAsync, unmount } = renderHook(() => useMusicPlayer([]));
    const spy = jest.spyOn(DownloadManager, 'resolveUri');
    ;(DownloadManager as any).resolveUri = async () => 'file:///cache/a.mp3';

    await actAsync(() =>
      result.current.controls.setQueue([
        { id: 'a', source: { uri: 'https://cdn.test/a.mp3', cacheable: false } },
      ])
    );

    // `cacheable: false` is the documented opt-out and already reached both
    // native players; honouring it only here would leave the flag meaning
    // different things in the same call.
    expect(spy).not.toHaveBeenCalled();
    const sent = JSON.parse(nativeMocks().music.setQueue.mock.calls[0][0] as string);
    expect(sent[0].source.uri).toBe('https://cdn.test/a.mp3');
    expect(sent[0].source.cacheable).toBe(false);
    spy.mockRestore();
    unmount();
    ;(DownloadManager as any).resolveUri = async () => 'file:///cache/a.mp3';
  });

  test('setQueue resolves per track, leaving a non-downloaded one alone', async () => {
    const { result, actAsync, unmount } = renderHook(() => useMusicPlayer([]));
    const original = DownloadManager.resolveUri;
    ;(DownloadManager as any).resolveUri = async (id: string) =>
      id === 'a' ? 'file:///cache/a.mp3' : null;

    await actAsync(() =>
      result.current.controls.setQueue([
        { id: 'a', source: { uri: 'https://cdn.test/a.mp3' } },
        { id: 'b', source: { uri: 'https://cdn.test/b.mp3' } },
      ])
    );

    // A queue is mixed: the downloaded track resolves, the streamed one keeps
    // its source. That is the whole point of the existence check.
    const sent = JSON.parse(nativeMocks().music.setQueue.mock.calls[0][0] as string);
    expect(sent.map((t: { source: { uri: string } }) => t.source.uri)).toEqual([
      'file:///cache/a.mp3',
      'https://cdn.test/b.mp3',
    ]);
    unmount();
    ;(DownloadManager as any).resolveUri = original;
  });

  test('setRepeatMode forwards the mode', () => {
    const { result, unmount } = renderHook(() => useMusicPlayer([]));

    result.current.controls.setRepeatMode('queue');

    expect(nativeMocks().music.setRepeatMode).toHaveBeenCalledWith('queue');
    unmount();
  });
});
