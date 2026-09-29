/**
 * Web offline download tests (FG-2.4).
 *
 * A recording `CacheStorage` double stands in for the browser. It is a Map keyed
 * by request URL, which is enough to prove the thing that actually matters: that
 * entries are keyed by download **id** rather than by media URL, so removal and
 * enumeration work. The old implementation keyed by `uri`, which is why
 * `removeDownload` had nothing to delete.
 *
 * Every rejection case is asserted on the *message*, because the whole point of
 * FG-2.4 is that a failure says what went wrong. The previous implementation
 * wrapped everything in `catch {}`, so a 404, an expired token and a CORS block
 * were all indistinguishable from success.
 */
import {
  isWebCacheStorageSupported,
  WebDownloadError,
  webClearCache,
  webDownload,
  webGetCacheSize,
  webGetDownloads,
  webRemoveDownload,
} from '../src/core/webDownloadCache';
import type { MediaSource } from '../src/types';

interface FakeCache {
  store: Map<string, { body: string; headers: Record<string, string> }>;
}

let cache: FakeCache;
let openedNames: string[];
let deletedNames: string[];
let fetchCalls: Array<{ url: string; init?: RequestInit }>;
let fetchImpl: (url: string) => Promise<any>;

const source: MediaSource = { uri: 'https://cdn.test/clip.mp4' };

function installCacheStorage() {
  cache = { store: new Map() };
  openedNames = [];
  deletedNames = [];

  (globalThis as any).caches = {
    async open(name: string) {
      openedNames.push(name);
      return {
        async put(request: any, response: any) {
          const url: string = typeof request === 'string' ? request : request.url;
          // A real Response exposes its headers; the test's does too.
          const headers: Record<string, string> = {};
          const src = response.headers;
          for (const key of ['content-type', 'x-omp-id', 'x-omp-uri', 'x-omp-final-uri', 'x-omp-stored-at', 'x-omp-bytes', 'content-length']) {
            const v = src?.get?.(key);
            if (v != null) headers[key] = v;
          }
          cache.store.set(url, {
            body: await response.text(),
            headers,
          });
        },
        async match(request: any) {
          const url: string = typeof request === 'string' ? request : request.url;
          const hit = cache.store.get(url);
          if (!hit) return undefined;
          return {
            headers: { get: (k: string) => hit.headers[k] ?? null },
          };
        },
        async delete(request: any) {
          const url: string = typeof request === 'string' ? request : request.url;
          return cache.store.delete(url);
        },
        async keys() {
          return [...cache.store.keys()].map((url) => ({ url }));
        },
      };
    },
    async delete(name: string) {
      deletedNames.push(name);
      // The real one removes every cache by that name.
      if (name === 'obsidian-media') {
        cache.store.clear();
        return true;
      }
      return false;
    },
  };
}

function fakeResponse(opts: { ok?: boolean; status?: number; size?: number; type?: string; url?: string } = {}) {
  const status = opts.status ?? 200;
  const size = opts.size ?? 1024;
  const type = opts.type ?? 'video/mp4';
  // A real `Blob`, not a `{ size, type }` stand-in. `new Response(body)` only
  // accepts a genuine BodyInit, and handing it a plain object makes undici do
  // something pathological — the first version of this double took 129s.
  const body = new Blob(['x'.repeat(size)], { type });
  return {
    ok: opts.ok ?? (status >= 200 && status < 300),
    status,
    url: opts.url ?? 'https://cdn.test/clip.mp4',
    headers: { get: (k: string) => (k === 'content-type' ? type : null) },
    blob: async () => body,
    async text() {
      return 'x'.repeat(size);
    },
  } as unknown as Response;
}

beforeEach(() => {
  installCacheStorage();
  fetchCalls = [];
  fetchImpl = async () => fakeResponse();
  (globalThis as any).fetch = (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return fetchImpl(url);
  };
  // Request/Response exist in Node 18+, but the double asserts on them, so make
  // the capability explicit rather than depending on the Node version.
  (globalThis as any).Request = globalThis.Request ?? class {};
  (globalThis as any).Response = globalThis.Response ?? class {};
});

afterEach(() => {
  delete (globalThis as any).caches;
  delete (globalThis as any).fetch;
});

describe('isWebCacheStorageSupported', () => {
  it('is true with a working caches API', () => {
    expect(isWebCacheStorageSupported()).toBe(true);
  });

  it('is false without caches', () => {
    delete (globalThis as any).caches;
    expect(isWebCacheStorageSupported()).toBe(false);
  });
});

describe('webDownload — round trip', () => {
  it('downloads, lists, and removes by id', async () => {
    // The plan's headline check, end to end.
    const info = await webDownload('clip-1', source);
    expect(info).toMatchObject({ id: 'clip-1', uri: source.uri, status: 'done' });
    expect(info.bytesDownloaded).toBe(1024);
    expect(info.bytesTotal).toBe(1024);

    const list = await webGetDownloads();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'clip-1', uri: source.uri, status: 'done' });
    // The reported uri is the source, never the internal cache key.
    expect(list[0].uri).toBe('https://cdn.test/clip.mp4');

    expect(await webRemoveDownload('clip-1')).toBe(true);
    expect(await webGetDownloads()).toEqual([]);
  });

  it('keys the entry by id, not by media url', async () => {
    await webDownload('clip-1', source);
    const [key] = [...cache.store.keys()];
    // This is what makes removal and enumeration possible at all. Keying by `uri`
    // (the old `cache.add`) meant `removeDownload(id)` had nothing to match.
    expect(key).not.toBe(source.uri);
    expect(key).toContain('clip-1');
    // RFC 2606 `.invalid`, so the key can never resolve or collide with a real
    // request — it only ever names a cache entry.
    expect(key).toMatch(/^https:\/\/[a-z.-]*\.invalid\//);
  });

  it('keeps two ids for the same media as separate entries', async () => {
    // Impossible when keyed by URL, and a real use case: the same file queued
    // from two playlists.
    await webDownload('a', { uri: 'https://cdn.test/same.mp4' });
    await webDownload('b', { uri: 'https://cdn.test/same.mp4' });
    const ids = (await webGetDownloads()).map((d) => d.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('re-downloading an id replaces rather than duplicates', async () => {
    await webDownload('a', { uri: 'https://cdn.test/one.mp4' });
    fetchImpl = async () => fakeResponse({ size: 2048 });
    await webDownload('a', { uri: 'https://cdn.test/two.mp4' });
    const list = await webGetDownloads();
    expect(list).toHaveLength(1);
    expect(list[0].uri).toBe('https://cdn.test/two.mp4');
    expect(list[0].bytesTotal).toBe(2048);
  });

  it('encodes ids that contain url-unsafe characters', async () => {
    await webDownload('a/b?c#d', { uri: 'https://cdn.test/x.mp4' });
    const list = await webGetDownloads();
    // The id has to survive the round trip through a URL key unchanged.
    expect(list[0].id).toBe('a/b?c#d');
  });

  it('round-trips an id containing a percent sign', async () => {
    // The load-bearing case. Reading an id back runs `decodeURIComponent`, which
    // *throws* on a malformed escape, so an unencoded `%` would make the entry
    // silently disappear from `getDownloads()` — a download that reports itself
    // as stored and then cannot be found or removed.
    await webDownload('100% done', { uri: 'https://cdn.test/x.mp4' });
    const list = await webGetDownloads();
    expect(list.map((d) => d.id)).toEqual(['100% done']);
  });

  it('round-trips a non-ascii id', async () => {
    // Header values must be ByteStrings, so an id or a uri is percent-encoded
    // before it goes into one. Storing the raw value makes `new Response` throw,
    // turning an em dash in a track title into a failed download.
    await webDownload('chanson — 1', { uri: 'https://cdn.test/x.mp4' });
    expect((await webGetDownloads()).map((d) => d.id)).toEqual(['chanson — 1']);
  });

  it('round-trips a non-ascii uri', async () => {
    await webDownload('a', { uri: 'https://cdn.test/ünïcode — file.mp4' });
    expect((await webGetDownloads())[0].uri).toBe('https://cdn.test/ünïcode — file.mp4');
  });

  it('sends MediaSource.headers', async () => {
    await webDownload('a', {
      uri: 'https://cdn.test/secure.mp4',
      headers: { Authorization: 'Bearer t' },
    });
    expect(fetchCalls[0].init?.headers).toEqual({ Authorization: 'Bearer t' });
  });

  it('records the content type and byte count', async () => {
    fetchImpl = async () => fakeResponse({ type: 'audio/mpeg', size: 2048 });
    await webDownload('a', { uri: 'https://cdn.test/x.mp3' });
    const stored = [...cache.store.values()][0];
    expect(stored.headers['content-type']).toBe('audio/mpeg');
    expect(stored.headers['x-omp-bytes']).toBe('2048');
  });
});

describe('webDownload — failures are visible', () => {
  it('explains a CORS block', async () => {
    fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    // Previously this was `catch {}`: a silent no-op that looked like success.
    const err = await webDownload('a', source).catch((e) => e as Error);
    expect(err).toBeInstanceOf(WebDownloadError);
    expect(err.message).toMatch(/Access-Control-Allow-Origin/);
  });

  it('names the status on a 403 and says credentials were rejected', async () => {
    fetchImpl = async () => fakeResponse({ ok: false, status: 403 });
    const err = await webDownload('a', source).catch((e) => e as Error);
    expect(err.message).toMatch(/HTTP 403/);
    expect(err.message).toMatch(/credentials were rejected/);
  });

  it('reports a 404 without blaming credentials', async () => {
    fetchImpl = async () => fakeResponse({ ok: false, status: 404 });
    const err = await webDownload('a', source).catch((e) => e as Error);
    expect(err.message).toMatch(/HTTP 404/);
    expect(err.message).not.toMatch(/credentials were rejected/);
  });

  it('stores nothing when the fetch fails', async () => {
    fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    await webDownload('a', source).catch(() => undefined);
    expect(cache.store.size).toBe(0);
  });

  it('refuses an hls source', async () => {
    await expect(
      webDownload('a', { uri: 'https://cdn.test/live.m3u8', type: 'hls' })
    ).rejects.toThrow(/segmented stream/);
    expect(fetchCalls).toHaveLength(0);
  });

  it('requires an id', async () => {
    await expect(webDownload('', source)).rejects.toThrow(/id is required/);
  });

  it('rejects when CacheStorage is missing rather than pretending to work', async () => {
    delete (globalThis as any).caches;
    await expect(webDownload('a', source)).rejects.toBeInstanceOf(WebDownloadError);
  });
});

describe('webGetDownloads', () => {
  it('ignores entries it did not write', async () => {
    await webDownload('a', source);
    // Something else using the same cache name must not appear as a download.
    cache.store.set('https://example.test/unrelated', {
      body: 'x',
      headers: {},
    });
    const list = await webGetDownloads();
    expect(list.map((d) => d.id)).toEqual(['a']);
  });

  it('returns an empty list for an empty store', async () => {
    expect(await webGetDownloads()).toEqual([]);
  });

  it('does not throw on a key it cannot decode', async () => {
    await webDownload('a', { uri: 'https://cdn.test/1.mp4' });
    // A key written by an older build, or hand-edited: the percent escape is
    // malformed, so `decodeURIComponent` throws. One undecodable key must not take
    // out the entire listing — a download list that renders as empty because of
    // one bad row is indistinguishable from "nothing is downloaded".
    cache.store.set('https://obsidian-media-player.invalid/download/100%', {
      body: 'x',
      headers: { 'x-omp-uri': encodeURIComponent('https://cdn.test/bad.mp4') },
    });
    const ids = (await webGetDownloads()).map((d) => d.id).sort();
    expect(ids).toEqual(['100%', 'a']);
  });
});

describe('webRemoveDownload', () => {
  it('resolves false for an unknown id', async () => {
    expect(await webRemoveDownload('nope')).toBe(false);
  });

  it('leaves other entries alone', async () => {
    await webDownload('a', { uri: 'https://cdn.test/1.mp4' });
    await webDownload('b', { uri: 'https://cdn.test/2.mp4' });
    await webRemoveDownload('a');
    expect((await webGetDownloads()).map((d) => d.id)).toEqual(['b']);
  });
});

describe('webClearCache', () => {
  it('empties the store', async () => {
    await webDownload('a', { uri: 'https://cdn.test/1.mp4' });
    await webDownload('b', { uri: 'https://cdn.test/2.mp4' });
    expect(cache.store.size).toBe(2);
    await webClearCache();
    expect(cache.store.size).toBe(0);
    expect(await webGetDownloads()).toEqual([]);
  });

  it('is a no-op when there is no CacheStorage', async () => {
    delete (globalThis as any).caches;
    await expect(webClearCache()).resolves.toBeUndefined();
  });
});

describe('webGetCacheSize', () => {
  it('sums the recorded sizes', async () => {
    await webDownload('a', { uri: 'https://cdn.test/1.mp4' });
    fetchImpl = async () => fakeResponse({ size: 2048 });
    await webDownload('b', { uri: 'https://cdn.test/2.mp4' });
    expect(await webGetCacheSize()).toBe(3072);
  });

  it('is 0 for an empty store, and without CacheStorage', async () => {
    expect(await webGetCacheSize()).toBe(0);
    delete (globalThis as any).caches;
    expect(await webGetCacheSize()).toBe(0);
  });

  it('falls back to content-length for an entry with no recorded size', async () => {
    await webDownload('a', { uri: 'https://cdn.test/1.mp4' });
    // An entry written by an older version, or by something else.
    const [key] = [...cache.store.keys()];
    cache.store.set(key, {
      body: 'x',
      headers: { 'content-length': '500' },
    });
    expect(await webGetCacheSize()).toBe(500);
  });
});
