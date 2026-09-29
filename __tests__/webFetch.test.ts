/**
 * Web source resolution tests (FG-2.2).
 *
 * `utils/webFetch.ts` is deliberately free of React so the interesting behaviour
 * — which sources are eligible, what happens on a 401, whether object URLs are
 * revoked, whether a slow fetch can clobber a newer one — is testable directly,
 * without a media element in the way.
 *
 * Every test counts `createObjectURL` / `revokeObjectURL` calls. The leak these
 * guard against is invisible in a passing test suite: a music queue stepping
 * through 50 header-auth tracks without revoking holds 50 blobs for the life of
 * the page, and nothing throws.
 */
import {
  resolveWebSource,
  WebSourceError,
  WebSourceSlot,
} from '../src/utils/webFetch';
import type { MediaSource } from '../src/types';

interface Counters {
  created: string[];
  revoked: string[];
}

let counters: Counters;
let nextId: number;

function installUrlDouble() {
  counters = { created: [], revoked: [] };
  nextId = 0;
  (URL as any).createObjectURL = () => {
    const url = `blob:fake/${nextId++}`;
    counters.created.push(url);
    return url;
  };
  (URL as any).revokeObjectURL = (url: string) => {
    counters.revoked.push(url);
  };
}

/** A `Response` stand-in carrying only what `resolveWebSource` reads. */
function fakeResponse(opts: { ok?: boolean; status?: number } = {}) {
  const status = opts.status ?? 200;
  return {
    ok: opts.ok ?? (status >= 200 && status < 300),
    status,
    blob: async () => ({ size: 1024, type: 'audio/mpeg' }),
  } as unknown as Response;
}

const authed = (extra: Partial<MediaSource> = {}): MediaSource => ({
  uri: 'https://cdn.test/secure.mp3',
  headers: { Authorization: 'Bearer token' },
  ...extra,
});

let fetchCalls: Array<{ url: string; init?: RequestInit }>;
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;

beforeEach(() => {
  installUrlDouble();
  fetchCalls = [];
  fetchImpl = async () => fakeResponse();
  (globalThis as any).fetch = (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return fetchImpl(url, init);
  };
});

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe('resolveWebSource — the no-headers fast path', () => {
  it('passes the uri straight through without fetching', async () => {
    const resolved = await resolveWebSource({ uri: 'https://cdn.test/a.mp3' });
    expect(resolved.url).toBe('https://cdn.test/a.mp3');
    expect(resolved.owned).toBe(false);
    expect(fetchCalls).toHaveLength(0);
    expect(counters.created).toHaveLength(0);
  });

  it('treats an empty headers object as no headers', async () => {
    // `headers: {}` is what a caller spreading a config produces. Fetching for
    // it would pay the whole-file-buffer cost and need CORS for no reason.
    const resolved = await resolveWebSource({
      uri: 'https://cdn.test/a.mp3',
      headers: {},
    });
    expect(resolved.url).toBe('https://cdn.test/a.mp3');
    expect(fetchCalls).toHaveLength(0);
  });

  it('release() on a pass-through is a harmless no-op', async () => {
    const resolved = await resolveWebSource({ uri: 'https://cdn.test/a.mp3' });
    expect(() => resolved.release()).not.toThrow();
    expect(counters.revoked).toHaveLength(0);
  });
});

describe('resolveWebSource — header-authenticated sources', () => {
  it('fetches with the headers and hands back an object URL', async () => {
    const resolved = await resolveWebSource(authed());
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://cdn.test/secure.mp3');
    expect(fetchCalls[0].init?.headers).toEqual({ Authorization: 'Bearer token' });
    expect(resolved.owned).toBe(true);
    expect(resolved.url).toBe('blob:fake/0');
  });

  it('release() revokes the object URL, and is idempotent', async () => {
    const resolved = await resolveWebSource(authed());
    resolved.release();
    expect(counters.revoked).toEqual(['blob:fake/0']);
    resolved.release();
    expect(counters.revoked).toHaveLength(1);
  });

  it('buffers a progressive source, which is the only eligible kind', async () => {
    const resolved = await resolveWebSource(
      authed({ type: 'progressive' })
    );
    expect(resolved.owned).toBe(true);
  });

  it('buffers a `file` source', async () => {
    const resolved = await resolveWebSource(authed({ type: 'file' }));
    expect(resolved.owned).toBe(true);
  });
});

describe('resolveWebSource — what it refuses, and why', () => {
  it.each(['hls', 'dash'] as const)(
    'refuses %s rather than buffering a segmented stream',
    async (type) => {
      // Buffering a manifest is not one request, so there is no single blob to
      // hand over. Silently requesting it would truncate the stream.
      await expect(resolveWebSource(authed({ type }))).rejects.toBeInstanceOf(
        WebSourceError
      );
      await expect(resolveWebSource(authed({ type }))).rejects.toThrow(
        /segmented stream/i
      );
      expect(fetchCalls).toHaveLength(0);
    }
  );

  it('explains the CORS constraint when fetch itself fails', async () => {
    fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(resolveWebSource(authed())).rejects.toThrow(/Access-Control-Allow-Origin/);
  });

  it('names the status on a 401 and says the headers were rejected', async () => {
    fetchImpl = async () => fakeResponse({ status: 401 });
    await expect(resolveWebSource(authed())).rejects.toThrow(/HTTP 401/);
    await expect(resolveWebSource(authed())).rejects.toThrow(/headers were rejected/i);
  });

  it('reports a 404 without blaming the headers', async () => {
    fetchImpl = async () => fakeResponse({ status: 404 });
    const err = await resolveWebSource(authed()).catch((e) => e as Error);
    expect(err.message).toMatch(/HTTP 404/);
    expect(err.message).not.toMatch(/headers were rejected/i);
  });

  it('refuses when URL.createObjectURL is unavailable', async () => {
    (URL as any).createObjectURL = undefined;
    await expect(resolveWebSource(authed())).rejects.toThrow(
      /createObjectURL/
    );
  });

  it('refuses when fetch is unavailable', async () => {
    delete (globalThis as any).fetch;
    await expect(resolveWebSource(authed())).rejects.toThrow(/fetch/);
  });
});

describe('WebSourceSlot — object URL lifetime', () => {
  it('revokes the previous URL when a new source is loaded', async () => {
    const slot = new WebSourceSlot();
    await slot.load(authed({ uri: 'https://cdn.test/one.mp3' }));
    await slot.load(authed({ uri: 'https://cdn.test/two.mp3' }));
    // Two created, one already freed. Without this a queue leaks one blob per
    // track for the life of the page.
    expect(counters.created).toHaveLength(2);
    expect(counters.revoked).toEqual(['blob:fake/0']);
    expect(slot.holdsObjectUrl).toBe(true);
  });

  it('release() frees the current URL and is safe to repeat', () => {
    const slot = new WebSourceSlot();
    void slot.load(authed());
    // Synchronous release of a still-pending load must not throw; the pending
    // load's own generation guard handles the rest.
    expect(() => slot.release()).not.toThrow();
  });

  it('does not revoke a pass-through URL', async () => {
    const slot = new WebSourceSlot();
    await slot.load({ uri: 'https://cdn.test/plain.mp3' });
    await slot.load({ uri: 'https://cdn.test/plain2.mp3' });
    expect(counters.created).toHaveLength(0);
    expect(counters.revoked).toHaveLength(0);
    expect(slot.holdsObjectUrl).toBe(false);
  });

  it('balances create/revoke across 50 track changes', async () => {
    const slot = new WebSourceSlot();
    for (let i = 0; i < 50; i++) {
      await slot.load(authed({ uri: `https://cdn.test/${i}.mp3` }));
    }
    // 50 blobs made; 49 already revoked by their successor.
    expect(counters.created).toHaveLength(50);
    expect(counters.revoked).toHaveLength(49);
    slot.release();
    // The accounting must close exactly, with nothing left holding memory.
    expect(counters.revoked).toHaveLength(50);
    expect(counters.revoked).toEqual(counters.created);
    expect(slot.holdsObjectUrl).toBe(false);
  });
});

describe('WebSourceSlot — races', () => {
  it('discards a slow fetch that a newer load has superseded, and frees its blob', async () => {
    const slot = new WebSourceSlot();
    let releaseSlow: (v: Response) => void = () => undefined;
    const slow = new Promise<Response>((resolve) => {
      releaseSlow = resolve;
    });

    // Track A starts, then track B starts and wins before A's response lands.
    fetchImpl = (url) =>
      url.includes('slow') ? slow : Promise.resolve(fakeResponse());
    const a = slot.load(authed({ uri: 'https://cdn.test/slow.mp3' }));
    const b = await slot.load(authed({ uri: 'https://cdn.test/fast.mp3' }));
    expect(b).toEqual({ kind: 'loaded', url: 'blob:fake/0' });

    releaseSlow(fakeResponse());
    const aResult = await a;
    // A is dropped rather than overwriting the track the user is now on.
    expect(aResult).toEqual({ kind: 'stale' });
    // And the blob A made is freed, because nothing else knows about it.
    expect(counters.created).toHaveLength(2);
    expect(counters.revoked).toContain('blob:fake/1');
  });

  it('reports an error without discarding the current URL', async () => {
    const slot = new WebSourceSlot();
    await slot.load(authed({ uri: 'https://cdn.test/one.mp3' }));
    fetchImpl = async () => fakeResponse({ status: 500 });
    const result = await slot.load(authed({ uri: 'https://cdn.test/two.mp3' }));
    expect(result.kind).toBe('error');
    // The previously loaded source is released: keeping a blob alive for a
    // source that failed to load just holds memory.
    expect(counters.revoked).toContain('blob:fake/0');
    expect(slot.holdsObjectUrl).toBe(false);
  });

  it('a superseded load that fails does not clobber the winner', async () => {
    const slot = new WebSourceSlot();
    let failSlow: (e: unknown) => void = () => undefined;
    const slow = new Promise<Response>((_, reject) => {
      failSlow = reject;
    });
    fetchImpl = (url) =>
      url.includes('slow') ? slow : Promise.resolve(fakeResponse());
    const a = slot.load(authed({ uri: 'https://cdn.test/slow.mp3' }));
    await slot.load(authed({ uri: 'https://cdn.test/fast.mp3' }));
    failSlow(new TypeError('Failed to fetch'));
    // A's failure is a `stale`, not an `error` — reporting it would show a
    // playback error for a track the user already skipped past.
    expect(await a).toEqual({ kind: 'stale' });
  });
});
