/**
 * Web `useMusicPlayer` tests.
 *
 * The web player is real logic — shuffle, repeat, skip, auto-advance, the
 * previous-button restart rule — not a stub, so it is tested directly against a
 * fake `HTMLAudioElement` that records listeners and lets the test dispatch the
 * element's own events.
 *
 * The environment is Node, so `globalThis.Audio` is installed per test. Every
 * assertion below checks a specific value rather than "it did not throw"; the
 * three order-indexing bugs these tests were written to pin (skipTo treating a
 * track index as a cursor, addTracks skipping `order`, removeTrack leaving
 * stale indices) all produced plausible-looking state, so only exact
 * track-index assertions catch them.
 */
import { renderHook } from './helpers';
import { useMusicPlayer } from '../src/hooks/useMusicPlayer.web';
import { INITIAL_STATE } from '../src/utils/media';
import type { PlaybackState, QueueSnapshot, Track } from '../src/types';

type Listener = () => void;

class FakeAudio {
  static instances: FakeAudio[] = [];

  src = '';
  currentTime = 0;
  duration = NaN;
  volume = 1;
  muted = false;
  playbackRate = 1;
  preload = '';
  loop = false;
  ended = false;
  error: { code: number; message?: string } | null = null;
  buffered: { length: number; end: (i: number) => number } = { length: 0, end: () => 0 };

  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  removeAttributeCalls: string[] = [];

  private listeners = new Map<string, Set<Listener>>();

  constructor() {
    FakeAudio.instances.push(this);
  }

  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }

  /** Total live listener count, for leak assertions. */
  get listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  play() {
    this.playCalls++;
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls++;
  }

  load() {
    this.loadCalls++;
  }

  removeAttribute(name: string) {
    this.removeAttributeCalls.push(name);
  }

  fire(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
}

function track(id: string): Track {
  return { id, title: id, source: { uri: `https://example.test/${id}.mp3` } };
}

/** The single element the hook created (it creates exactly one, on mount). */
function el(): FakeAudio {
  expect(FakeAudio.instances).toHaveLength(1);
  return FakeAudio.instances[0];
}

type Hook = ReturnType<typeof useMusicPlayer>;

let hook: ReturnType<typeof renderHook<Hook>>;

async function mount(tracks: Track[] = []) {
  hook = renderHook(() => useMusicPlayer(tracks));
  // The first track is resolved asynchronously before the element is told
  // what to play, so drain that before the test asserts on it.
  await hook.actAsync();
  return {
    get state(): PlaybackState {
      return hook.result.current.state;
    },
    get queue(): QueueSnapshot {
      return hook.result.current.queue;
    },
    get controls() {
      return hook.result.current.controls;
    },
  };
}

beforeEach(() => {
  FakeAudio.instances = [];
  (globalThis as any).Audio = FakeAudio;
});

afterEach(() => {
  delete (globalThis as any).Audio;
});

describe('useMusicPlayer.web — initial state', () => {
  it('preloads the first track, so status is ready rather than idle', async () => {
    const t = await mount([track('a'), track('b')]);
    // Not `INITIAL_STATE`: with tracks supplied the hook loads the first one so
    // `play()` works without a first click, so `ready` is the honest status.
    // Everything else must still be the initial value.
    expect(t.state.status).toBe('ready');
    expect(t.state).toMatchObject({
      position: 0,
      duration: 0,
      rate: 1,
      muted: false,
      volume: 1,
      buffered: 0,
      inBackground: false,
    });
    expect(t.queue.tracks.map((x) => x.id)).toEqual(['a', 'b']);
    expect(t.queue.index).toBe(0);
  });

  it('loads the first track into the element without playing it', async () => {
    await mount([track('a'), track('b')]);
    expect(el().src).toBe('https://example.test/a.mp3');
    expect(el().playCalls).toBe(0);
  });
});

describe('useMusicPlayer.web — queue editing', () => {
  it('setQueue replaces the tracks and resets the index to 0', async () => {
    const t = await mount([track('a'), track('b')]);
    await hook.actAsync(() => t.controls.setQueue([track('c'), track('d'), track('e')]));
    expect(t.queue.tracks.map((x) => x.id)).toEqual(['c', 'd', 'e']);
    expect(t.queue.index).toBe(0);
  });

  it('addTracks appends to the track list AND makes the new tracks reachable', async () => {
    const t = await mount([track('a')]);
    await hook.actAsync(() => t.controls.addTracks([track('b'), track('c')]));
    expect(t.queue.tracks.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    // The regression: a track present in `tracks` but absent from `order` can
    // never be played, because every read goes through `order[cursor]`.
    await hook.actAsync(() => t.controls.skipTo(2));
    expect(t.queue.index).toBe(2);
    expect(el().src).toBe('https://example.test/c.mp3');
  });

  it('removing a non-active track does not interrupt playback', async () => {
    const t = await mount([track('a'), track('b'), track('c')]);
    await hook.actAsync(() => t.controls.skipTo(0));
    const before = el().src;
    await hook.actAsync(() => t.controls.removeTrack('c'));
    expect(t.queue.tracks.map((x) => x.id)).toEqual(['a', 'b']);
    // Reloading here would restart the current song on every queue edit.
    expect(el().src).toBe(before);
  });

  it('removing the active track keeps order pointing at the right tracks', async () => {
    const t = await mount([track('a'), track('b'), track('c')]);
    await hook.actAsync(() => t.controls.skipTo(0));
    await hook.actAsync(() => t.controls.removeTrack('a'));
    expect(t.queue.tracks.map((x) => x.id)).toEqual(['b', 'c']);
    // `order` was renumbered, so index 0 must now resolve to 'b' — not to the
    // stale entry, and not to 'c'.
    expect(t.queue.index).toBe(0);
    expect(el().src).toBe('https://example.test/b.mp3');
  });

  it('removing a track before the cursor shifts the cursor but keeps the same song', async () => {
    const t = await mount([track('a'), track('b'), track('c')]);
    await hook.actAsync(() => t.controls.skipTo(2)); // playing 'c'
    await hook.actAsync(() => t.controls.removeTrack('a'));
    // Still 'c', now at index 1, and still loaded in the element.
    expect(t.queue.tracks.map((x) => x.id)).toEqual(['b', 'c']);
    expect(t.queue.index).toBe(1);
    expect(el().src).toBe('https://example.test/c.mp3');
  });

  it('removeTrack ignores an unknown id', async () => {
    const t = await mount([track('a'), track('b')]);
    await hook.actAsync(() => t.controls.removeTrack('nope'));
    expect(t.queue.tracks.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('removing the active track when it is last leaves a valid playable track', async () => {
    const t = await mount([track('a'), track('b')]);
    await hook.actAsync(() => t.controls.skipTo(1)); // playing 'b', the last one
    await hook.actAsync(() => t.controls.removeTrack('b'));
    // The cursor clamp is not enough on its own: if `order` is left holding the
    // old indices, `order[cursor]` runs off the end of the shortened track list
    // and resolves to `undefined`, so nothing is loaded and no track is current.
    expect(t.queue.tracks.map((x) => x.id)).toEqual(['a']);
    expect(t.queue.index).toBe(0);
    expect(t.queue.tracks[t.queue.index].id).toBe('a');
    expect(el().src).toBe('https://example.test/a.mp3');
  });

  it('with shuffle on, removing a different track keeps the same song loaded', async () => {
    const t = await mount([track('a'), track('b'), track('c'), track('d')]);
    await hook.actAsync(() => t.controls.setShuffle(true));
    // Read the active track out of the snapshot rather than assuming an
    // order, so this does not depend on the shuffle that happened to occur.
    const activeId = t.queue.tracks[t.queue.index].id;
    const otherId = t.queue.tracks.find((x) => x.id !== activeId)!.id;
    const beforeSrc = el().src;

    await hook.actAsync(() => t.controls.removeTrack(otherId));

    // Under a permutation, a stale `order` is not self-cancelling: deleting any
    // track shifts every later index, so `order[cursor]` lands on a different
    // song (or on nothing) even though the cursor itself was correct.
    expect(t.queue.tracks[t.queue.index].id).toBe(activeId);
    expect(el().src).toBe(beforeSrc);
  });

  it('emptying the queue stops cleanly instead of indexing into nothing', async () => {
    const t = await mount([track('a'), track('b')]);
    await hook.actAsync(() => t.controls.removeTrack('a'));
    await hook.actAsync(() => t.controls.removeTrack('b'));
    expect(t.queue.tracks).toEqual([]);
    // -1, not 0: `currentIndex` is the shared helper and returns its
    // "no current track" sentinel, so an empty queue has no index 0. Reading
    // `tracks[index]` unguarded yields `undefined` either way, which is why the
    // sentinel is worth asserting rather than leaving loose.
    expect(t.queue.index).toBe(-1);
    expect(t.state.status).toBe('idle');
  });
});

describe('useMusicPlayer.web — skipTo maps a track index, not a cursor', () => {
  it('with shuffle on, skipTo plays the requested track', async () => {
    const t = await mount([track('a'), track('b'), track('c'), track('d')]);
    await hook.actAsync(() => t.controls.setShuffle(true));
    // `order` is a permutation, so a cursor and a track index differ. This
    // asserts the requested *track* is the one loaded.
    for (const id of ['a', 'b', 'c', 'd']) {
      const target = t.queue.tracks.findIndex((x) => x.id === id);
      await hook.actAsync(() => t.controls.skipTo(target));
      expect(t.queue.index).toBe(target);
      expect(el().src).toBe(`https://example.test/${id}.mp3`);
    }
  });

  it('ignores an out-of-range index', async () => {
    const t = await mount([track('a'), track('b')]);
    const before = el().src;
    await hook.actAsync(() => t.controls.skipTo(7));
    await hook.actAsync(() => t.controls.skipTo(-1));
    expect(el().src).toBe(before);
    expect(t.queue.index).toBe(0);
  });
});

describe('useMusicPlayer.web — auto-advance on ended', () => {
  it('advances to the next track', async () => {
    const t = await mount([track('a'), track('b'), track('c')]);
    await hook.actAsync(() => el().fire('ended'));
    expect(t.queue.index).toBe(1);
    expect(el().src).toBe('https://example.test/b.mp3');
  });

  it('stops at the end with repeat off instead of wrapping', async () => {
    const t = await mount([track('a'), track('b')]);
    await hook.actAsync(() => el().fire('ended')); // -> b
    expect(t.queue.index).toBe(1);
    await hook.actAsync(() => el().fire('ended')); // end of queue
    expect(t.state.status).toBe('ended');
    expect(t.queue.index).toBe(1);
    expect(el().src).toBe('https://example.test/b.mp3');
  });

  it('wraps to the start with repeat queue', async () => {
    const t = await mount([track('a'), track('b')]);
    await hook.actAsync(() => t.controls.setRepeatMode('queue'));
    await hook.actAsync(() => el().fire('ended')); // -> b
    expect(t.queue.index).toBe(1);
    await hook.actAsync(() => el().fire('ended')); // wraps
    expect(t.queue.index).toBe(0);
    expect(el().src).toBe('https://example.test/a.mp3');
  });
});

describe('useMusicPlayer.web — next / previous', () => {
  it('next at the end with repeat off reports ended and pauses', async () => {
    const t = await mount([track('a')]);
    await hook.actAsync(() => t.controls.next());
    expect(t.state.status).toBe('ended');
    expect(el().pauseCalls).toBeGreaterThan(0);
  });

  it('previous restarts the track when more than 3s in, like a hardware button', async () => {
    const t = await mount([track('a'), track('b')]);
    await hook.actAsync(() => t.controls.skipTo(1));
    el().currentTime = 30;
    const src = el().src;
    await hook.actAsync(() => t.controls.previous());
    expect(el().currentTime).toBe(0);
    expect(el().src).toBe(src);
    expect(t.queue.index).toBe(1);
  });

  it('previous steps back when within the first 3s', async () => {
    const t = await mount([track('a'), track('b'), track('c')]);
    await hook.actAsync(() => t.controls.skipTo(2));
    el().currentTime = 1;
    await hook.actAsync(() => t.controls.previous());
    expect(t.queue.index).toBe(1);
    expect(el().src).toBe('https://example.test/b.mp3');
  });
});

describe('useMusicPlayer.web — transport and properties', () => {
  it('play, pause, stop and seek write through to the element', async () => {
    const t = await mount([track('a')]);
    await hook.actAsync(() => t.controls.play());
    expect(el().playCalls).toBe(1);
    // Published by `play()` itself, not by the element's `play` event — the
    // fake element does not fire one, and a browser that rejects autoplay never
    // will. The event path is covered separately below.
    expect(t.state.status).toBe('playing');

    await hook.actAsync(() => t.controls.pause());
    expect(t.state.status).toBe('paused');

    await hook.actAsync(() => t.controls.seek(42));
    expect(el().currentTime).toBe(42);
    expect(t.state.position).toBe(42);

    await hook.actAsync(() => t.controls.stop());
    expect(el().currentTime).toBe(0);
    expect(t.state.status).toBe('idle');
    expect(t.state.position).toBe(0);
  });

  it("tracks the element's own play event", async () => {
    const t = await mount([track('a')]);
    await hook.actAsync(() => t.controls.pause());
    expect(t.state.status).toBe('paused');
    // A real element fires this on its own; the hook must follow it.
    await hook.actAsync(() => el().fire('play'));
    expect(t.state.status).toBe('playing');
  });

  it('seek clamps to the duration and to zero', async () => {
    const t = await mount([track('a')]);
    el().duration = 100;
    await hook.actAsync(() => t.controls.seek(500));
    expect(el().currentTime).toBe(100);
    await hook.actAsync(() => t.controls.seek(-20));
    expect(el().currentTime).toBe(0);
  });

  it('setRate, setVolume and setMuted reach both the element and state', async () => {
    const t = await mount([track('a')]);
    await hook.actAsync(() => t.controls.setRate(1.5));
    await hook.actAsync(() => t.controls.setVolume(0.25));
    await hook.actAsync(() => t.controls.setMuted(true));
    expect(el().playbackRate).toBe(1.5);
    expect(el().volume).toBe(0.25);
    expect(el().muted).toBe(true);
    expect(t.state).toMatchObject({ rate: 1.5, volume: 0.25, muted: true });
  });
});

describe('useMusicPlayer.web — element events', () => {
  it('timeupdate publishes position, duration and buffered progress', async () => {
    const t = await mount([track('a')]);
    el().duration = 200;
    el().currentTime = 55;
    el().buffered = { length: 1, end: () => 90 };
    await hook.actAsync(() => el().fire('timeupdate'));
    expect(t.state).toMatchObject({ position: 55, duration: 200, buffered: 90 });
  });

  it('waiting and playing drive the buffering status', async () => {
    const t = await mount([track('a')]);
    await hook.actAsync(() => el().fire('waiting'));
    expect(t.state.status).toBe('buffering');
    await hook.actAsync(() => el().fire('playing'));
    expect(t.state.status).toBe('playing');
  });

  it('pause after ended reports ended, not paused', async () => {
    const t = await mount([track('a')]);
    el().ended = true;
    await hook.actAsync(() => el().fire('pause'));
    expect(t.state.status).toBe('ended');
  });

  it('error code 4 explains the likely cause instead of a bare number', async () => {
    const t = await mount([track('a')]);
    el().error = { code: 4 };
    await hook.actAsync(() => el().fire('error'));
    expect(t.state.status).toBe('error');
    expect(t.state.error).toMatch(/CORS|404|unsupported/i);
  });

  it('an unknown duration stays 0 rather than becoming NaN', async () => {
    const t = await mount([track('a')]);
    expect(Number.isNaN(el().duration)).toBe(true);
    await hook.actAsync(() => el().fire('timeupdate'));
    expect(t.state.duration).toBe(0);
  });
});

describe('useMusicPlayer.web — handle stability (FG-1.3 invariants)', () => {
  it('keeps one controls identity across re-renders and progress ticks', async () => {
    const t = await mount([track('a'), track('b')]);
    const first = t.controls;
    el().duration = 100;
    for (let i = 1; i <= 5; i++) {
      el().currentTime = i;
      await hook.actAsync(() => el().fire('timeupdate'));
    }
    hook.rerender();
    expect(t.controls).toBe(first);
  });

  it('getState and getQueue resolve live values, not the first render', async () => {
    const t = await mount([track('a'), track('b')]);
    el().duration = 300;
    el().currentTime = 120;
    await hook.actAsync(() => el().fire('timeupdate'));

    // Reading a value captured at first render is the exact bug FG-1.3 fixed,
    // so this asserts the post-update position, not just that a promise
    // resolved.
    const state = await t.controls.getState();
    expect(state?.position).toBe(120);
    expect(state?.duration).toBe(300);

    await hook.actAsync(() => t.controls.skipTo(1));
    const queue = await t.controls.getQueue();
    expect(queue?.index).toBe(1);
  });
});

describe('useMusicPlayer.web — platform no-ops', () => {
  it('background audio and remote controls are ignored, not errors', async () => {
    // These props are set unconditionally by cross-platform code, so throwing
    // here would crash web builds that otherwise work. The no-op stubs return
    // undefined rather than a rejected promise, so awaiting them is safe.
    const t = await mount([track('a')]);
    expect(t.controls.setBackgroundEnabled(true)).toBeUndefined();
    expect(
      t.controls.setRemoteControls({
        play: true,
        pause: true,
        nextTrack: true,
        previousTrack: true,
      })
    ).toBeUndefined();
    // And the player is still usable afterwards.
    expect(t.state.status).not.toBe('error');
  });
});

describe('useMusicPlayer.web — cleanup', () => {
  it('removes every listener and releases the element on unmount', async () => {
    await mount([track('a')]);
    const media = el();
    expect(media.listenerCount).toBeGreaterThan(0);
    hook.unmount();
    // A leaked listener keeps the decoded media and the closure alive after the
    // component is gone.
    expect(media.listenerCount).toBe(0);
    expect(media.pauseCalls).toBeGreaterThan(0);
    expect(media.removeAttributeCalls).toContain('src');
    expect(media.loadCalls).toBeGreaterThan(0);
  });

  it('reports an error instead of throwing when Audio is unavailable', async () => {
    delete (globalThis as any).Audio;
    const t = await mount([track('a')]);
    expect(t.state.status).toBe('error');
    expect(t.state.error).toMatch(/HTMLAudioElement/i);
  });
});

describe('useMusicPlayer.web — header-authenticated sources (FG-2.2)', () => {
  let created: string[];
  let revoked: string[];
  let fetchImpl: (url: string) => Promise<any>;
  let fetchCalls: string[];

  /** A track that authenticates via a request header, which `src` cannot express. */
  const secure = (id: string): Track => ({
    id,
    title: id,
    source: {
      uri: `https://cdn.test/${id}.mp3`,
      headers: { Authorization: 'Bearer token' },
    },
  });

  beforeEach(() => {
    created = [];
    revoked = [];
    fetchCalls = [];
    let n = 0;
    (URL as any).createObjectURL = () => {
      const url = `blob:fake/${n++}`;
      created.push(url);
      return url;
    };
    (URL as any).revokeObjectURL = (url: string) => revoked.push(url);
    fetchImpl = async () => ({ ok: true, status: 200, blob: async () => ({ size: 10 }) });
    (globalThis as any).fetch = (url: string) => {
      fetchCalls.push(url);
      return fetchImpl(url);
    };
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('loads a header-auth track as a blob URL rather than the raw uri', async () => {
    const t = await mount([secure('a')]);
    // The element cannot be given the uri: it would be sent without the
    // Authorization header and come back 401.
    expect(fetchCalls).toEqual(['https://cdn.test/a.mp3']);
    expect(el().src).toBe('blob:fake/0');
    expect(el().src).not.toContain('cdn.test');
  });

  it('surfaces a 404 as status error with the status in the message', async () => {
    fetchImpl = async () => ({ ok: false, status: 404, blob: async () => ({}) });
    const t = await mount([secure('a')]);
    // Loud, per FG-2.2: a src that 401s/404s otherwise leaves an element that
    // never fires `error` and a player stuck on `loading`.
    expect(t.state.status).toBe('error');
    expect(t.state.error).toMatch(/HTTP 404/);
  });

  it('refuses a header-auth HLS source with an explanation', async () => {
    fetchImpl = async () => ({ ok: true, status: 200, blob: async () => ({}) });
    const t = await mount([
      {
        id: 'live',
        title: 'live',
        source: {
          uri: 'https://cdn.test/live.m3u8',
          type: 'hls',
          headers: { Authorization: 'Bearer token' },
        },
      },
    ]);
    expect(t.state.status).toBe('error');
    expect(t.state.error).toMatch(/segmented stream/i);
    // No pointless fetch of a manifest that could not be used.
    expect(fetchCalls).toEqual([]);
  });

  it('revokes each blob when skipping, so a long queue does not accumulate them', async () => {
    const t = await mount([secure('a'), secure('b'), secure('c')]);
    await hook.actAsync(() => t.controls.skipTo(1));
    await hook.actAsync(() => t.controls.skipTo(2));
    expect(created).toHaveLength(3);
    // Each superseded track's blob is freed as the next one loads.
    expect(revoked).toEqual(['blob:fake/0', 'blob:fake/1']);
  });

  it('revokes the outstanding blob on unmount', async () => {
    await mount([secure('a')]);
    expect(revoked).toHaveLength(0);
    hook.unmount();
    // Otherwise the object URL outlives the component for the life of the page.
    expect(revoked).toEqual(['blob:fake/0']);
  });
});
