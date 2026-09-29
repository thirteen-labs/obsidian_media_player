import type { MediaSource } from '../types';

/**
 * Resolving a `MediaSource` for an HTML media element, including the
 * `headers` case that `src` alone cannot express.
 *
 * An HTML media element has no header API — there is no equivalent of
 * ExoPlayer's `DefaultHttpDataSource` headers or AVPlayer's
 * `AVURLAssetHTTPHeaderFieldsKey`. A source that authenticates via a bearer
 * token simply cannot be expressed as `src`. The only thing a browser will
 * accept is a URL it can fetch without extra headers, which means fetching the
 * bytes ourselves and handing the element an object URL.
 *
 * Three consequences, all of them real limits rather than choices:
 *
 * 1. **Whole-file buffering.** The element gets a finished blob, so a 200 MB
 *    video is a 200 MB allocation before playback starts. Only progressive
 *    sources are eligible (see `SEGMENTED_TYPES`).
 * 2. **CORS.** `fetch` is subject to the same-origin policy, so the origin has
 *    to send `Access-Control-Allow-Origin`. A header-auth source on a CDN that
 *    does not cooperate is unusable on web, and no client-side code can fix it.
 * 3. **No range requests.** Seeking inside a blob is done by the browser against
 *    memory rather than by re-issuing an HTTP range request, so seeking a
 *    header-auth source costs more than seeking a plain one.
 *
 * When there are no headers this is a pass-through, so the common case stays a
 * plain `src` assignment and needs no CORS cooperation at all.
 */

/** Types that are fetched as a stream of segments and so cannot be buffered. */
const SEGMENTED_TYPES = new Set(['hls', 'dash']);

/**
 * A resolution failure that is *not* a network error — either the source cannot
 * be expressed on web at all, or the environment lacks the APIs. Distinct from
 * a rejected `fetch` so callers can word the message differently.
 */
export class WebSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebSourceError';
  }
}

export interface ResolvedWebSource {
  /** Value to assign to the element's `src`. */
  url: string;
  /** True when `url` is an object URL created here, and so must be revoked. */
  owned: boolean;
  /** Frees the object URL. Safe to call more than once. */
  release: () => void;
}

const noop = () => undefined;

function canCreateObjectURL(): boolean {
  return (
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof URL.revokeObjectURL === 'function'
  );
}

/**
 * Resolves a source to something an HTML media element can load.
 *
 * Throws `WebSourceError` when the source cannot be served on web; rejects with
 * whatever `fetch` rejected with when the network is the problem. Callers
 * surface both as `status: 'error'` — a silent `<video>` that never fires
 * `error` is the failure mode this exists to prevent.
 */
export async function resolveWebSource(source: MediaSource): Promise<ResolvedWebSource> {
  const headers = source.headers;
  const hasHeaders = !!headers && Object.keys(headers).length > 0;

  if (!hasHeaders) {
    // Fast path: the element can fetch this itself, with range requests and
    // streaming intact. No CORS cooperation needed beyond what playback always
    // required.
    return { url: source.uri, owned: false, release: noop };
  }

  if (source.type && SEGMENTED_TYPES.has(source.type)) {
    // Buffering a manifest and then its segments is not one request, so there is
    // no single blob to hand over. Supporting this means driving MSE
    // (SourceBuffer) and re-attaching the headers per segment — a real feature,
    // not a fallback. Say so instead of silently requesting a truncated file.
    throw new WebSourceError(
      `Request headers are not supported on web for \`type: '${source.type}'\`. ` +
        'A segmented stream cannot be buffered into a single object URL. ' +
        'Omit `headers` and put the credential in the URL (e.g. a signed ' +
        'query string) if the origin supports it, or proxy the stream through ' +
        'your own same-origin endpoint.'
    );
  }

  if (typeof fetch !== 'function') {
    throw new WebSourceError(
      'Request headers need `fetch`, which is not available in this environment.'
    );
  }

  if (!canCreateObjectURL()) {
    throw new WebSourceError(
      'Request headers need `URL.createObjectURL`, which is not available in ' +
        'this environment.'
    );
  }

  let response: Response;
  try {
    response = await fetch(source.uri, { headers });
  } catch (err) {
    // Almost always CORS: a cross-origin fetch that the origin did not allow
    // is reported as a bare `TypeError: Failed to fetch`.
    throw new WebSourceError(
      `Could not fetch ${source.uri} with request headers: ` +
        `${err instanceof Error ? err.message : String(err)}. ` +
        'If this is a cross-origin source, the origin must respond with ' +
        '`Access-Control-Allow-Origin` — browser CORS rules apply to `fetch` ' +
        'and cannot be bypassed from JavaScript.'
    );
  }

  if (!response.ok) {
    // 401/403 is the usual outcome of a missing or expired token; naming the
    // status saves the reader from assuming the URL itself is wrong.
    throw new WebSourceError(
      `Could not fetch ${source.uri} with request headers: HTTP ${response.status}` +
        `${response.status === 401 || response.status === 403
          ? ' (the request headers were rejected — check the token)'
          : ''}.`
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  let released = false;
  return {
    url,
    owned: true,
    release: () => {
      // Idempotent: revoking twice is harmless, but the guard keeps a
      // double-release from looking like a real leak in a test double.
      if (released) return;
      released = true;
      URL.revokeObjectURL(url);
    },
  };
}

export type WebSourceResult =
  | { kind: 'loaded'; url: string }
  /** Superseded by a newer `load` while this one was in flight. */
  | { kind: 'stale' }
  | { kind: 'error'; message: string };

/**
 * Holds the object URL for the currently loaded source.
 *
 * Two things every call site would otherwise get wrong, kept in one place:
 *
 * - **Revoking.** A music queue stepping through 50 header-auth tracks without
 *   revoking leaks every blob for the life of the page. Each successful load
 *   revokes its predecessor, and `release()` frees the last one.
 * - **Races.** Loading is asynchronous, so a slow fetch for track A can land
 *   after the user has already skipped to track B and overwrite it. A
 *   generation counter discards any resolution that is no longer the newest.
 */
export class WebSourceSlot {
  private owned: string | null = null;
  private generation = 0;

  /**
   * Resolves `source` and takes ownership of the result. Revokes the URL that
   * was loaded previously, if any.
   */
  async load(source: MediaSource): Promise<WebSourceResult> {
    const generation = ++this.generation;
    let resolved: ResolvedWebSource;
    try {
      resolved = await resolveWebSource(source);
    } catch (err) {
      // A failure from a superseded load is not an error. The user has already
      // moved on, and reporting it would put a playback error on screen for a
      // track they skipped past. `release()` is the current generation's to do.
      if (generation !== this.generation) return { kind: 'stale' };
      this.release();
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    if (generation !== this.generation) {
      // A newer load won the race. Free the blob we just made — nobody else
      // knows about it, so nothing else will.
      resolved.release();
      return { kind: 'stale' };
    }

    this.release();
    if (resolved.owned) this.owned = resolved.url;
    return { kind: 'loaded', url: resolved.url };
  }

  /** Revokes the current object URL, if any. Safe to call repeatedly. */
  release(): void {
    if (this.owned === null) return;
    URL.revokeObjectURL(this.owned);
    this.owned = null;
  }

  /** True while this slot owns an object URL. For leak assertions in tests. */
  get holdsObjectUrl(): boolean {
    return this.owned !== null;
  }
}
