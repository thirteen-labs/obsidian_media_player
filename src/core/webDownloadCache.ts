import type { DownloadInfo, MediaSource } from '../types';

/**
 * Web offline downloads, on `CacheStorage`.
 *
 * Extracted from `core/DownloadManager.ts` for the same reason `utils/webFetch.ts`
 * and `utils/webSession.ts` exist: this is a platform-specific implementation
 * behind a shared interface, and keeping it out of the delegator means it can be
 * tested without React Native's `Platform` or a native module mock.
 *
 * ## Why synthetic keys
 *
 * `CacheStorage` is keyed by `Request`, and it has no concept of an id. The
 * previous implementation called `cache.add(uri)`, which keys by the media URL —
 * so the same file could not be downloaded twice under two ids, and
 * `removeDownload(id)` had nothing to delete. It now `put`s under a synthetic URL
 * derived from the id:
 *
 * ```
 * https://obsidian-media-player.invalid/download/<encoded id>
 * ```
 *
 * The `.invalid` TLD is reserved by RFC 2606 and can never resolve, so the key
 * can never collide with a real request. It is not fetched — it only names a cache
 * entry — and it means lookup, deletion and enumeration all work from the id
 * alone, across page reloads, which is what the native `SimpleCache` /
 * `AVAssetDownloadTask` path already gives you.
 *
 * ## Why the fetch is manual
 *
 * `cache.add()` would be one line, but it hides the response, so there is nowhere
 * to read a status from, nowhere to attach metadata, and no way to send
 * `MediaSource.headers`. The bytes are fetched here and stored as a `Response`
 * this module constructs, carrying the metadata in custom headers. One cache
 * entry, no separate index to keep in sync.
 *
 * ## CORS
 *
 * `fetch` and CacheStorage are both subject to the same-origin policy. A
 * cross-origin source that does not send `Access-Control-Allow-Origin` cannot be
 * downloaded at all, and no client-side code can change that. This is the same
 * constraint as FG-2.2, and it is the single most likely reason a download fails.
 */

const CACHE_NAME = 'obsidian-media';

/** RFC 2606 reserves `.invalid`, so this can never resolve or collide. */
const KEY_PREFIX = 'https://obsidian-media-player.invalid/download/';

const H_URI = 'x-omp-uri';
const H_FINAL_URI = 'x-omp-final-uri';
const H_CONTENT_TYPE = 'x-omp-content-type';
const H_STORED_AT = 'x-omp-stored-at';
const H_BYTES = 'x-omp-bytes';

function keyFor(id: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(id)}`;
}

/**
 * `decodeURIComponent` throws on a malformed escape (`"100%"`), so every read
 * goes through here. An entry we cannot decode is one we cannot identify, and
 * reporting it as absent is better than throwing out of a listing call.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function idFromKey(url: string): string | null {
  if (!url.startsWith(KEY_PREFIX)) return null;
  return safeDecode(url.slice(KEY_PREFIX.length));
}

/** A download that cannot work on web, as opposed to one that failed. */
export class WebDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebDownloadError';
  }
}

/** True when this environment can actually store a download. */
export function isWebCacheStorageSupported(): boolean {
  return (
    typeof caches !== 'undefined' &&
    typeof caches.open === 'function' &&
    typeof Request === 'function' &&
    typeof Response === 'function'
  );
}

async function openCache(): Promise<Cache> {
  if (!isWebCacheStorageSupported()) {
    throw new WebDownloadError(
      'Offline downloads need the CacheStorage API, which this environment does ' +
        'not provide. On web that means a secure context (HTTPS or localhost).'
    );
  }
  return caches.open(CACHE_NAME);
}

/**
 * Downloads `source` and stores it under `id`.
 *
 * Rejects rather than swallowing. The previous implementation wrapped the whole
 * body in `catch {}`, so a 404, an expired token and a CORS rejection were all
 * indistinguishable from success — a user watching a download list had no way to
 * learn that nothing had been saved.
 */
export async function webDownload(
  id: string,
  source: MediaSource
): Promise<DownloadInfo> {
  if (!id) throw new WebDownloadError('A download id is required.');

  // CacheStorage rejects a response that came from a redirect, and a body that
  // has already been consumed. Fetching by hand sidesteps both.
  const headers = source.headers;
  const hasHeaders = !!headers && Object.keys(headers).length > 0;

  if (source.type === 'hls' || source.type === 'dash') {
    // Unconditional, unlike FG-2.2's playback path. *Playing* a segmented stream
    // on web works because the element fetches the manifest and its segments
    // itself. *Storing* it does not: a cache entry holds one body, and a
    // segmented stream is a manifest plus many segments. Downloading the manifest
    // alone would save something that cannot be played back later — a silent,
    // useless download, which is worse than refusing.
    throw new WebDownloadError(
      `Offline download is not supported on web for \`type: '${source.type}'\`. ` +
        'A segmented stream is a manifest plus many segments, and a cache entry ' +
        'can hold only one body.'
    );
  }

  let response: Response;
  try {
    response = await fetch(source.uri, hasHeaders ? { headers } : undefined);
  } catch (err) {
    throw new WebDownloadError(
      `Could not download ${source.uri}: ` +
        `${err instanceof Error ? err.message : String(err)}. ` +
        'If this is a cross-origin source, the origin must respond with ' +
        '`Access-Control-Allow-Origin` — browser CORS rules apply to `fetch` ' +
        'and cannot be bypassed from JavaScript.'
    );
  }

  if (!response.ok) {
    throw new WebDownloadError(
      `Could not download ${source.uri}: HTTP ${response.status}` +
        `${response.status === 401 || response.status === 403
          ? ' (the request headers or credentials were rejected)'
          : ''}.`
    );
  }

  // Read the body once. `blob().size` is the byte count actually stored, which is
  // more honest than a `Content-Length` the origin may have guessed.
  const blob = await response.blob();

  const stored = new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') || blob.type || '',
      // Percent-encoded because a header value must be a ByteString. A raw id or
      // a raw non-ASCII uri makes `new Response` throw outright, which would turn
      // "track title with an em dash" into a failed download. The id is not stored
      // here at all — it is recovered from the cache key, which is the design.
      [H_URI]: encodeURIComponent(source.uri),
      [H_FINAL_URI]: encodeURIComponent(response.url || source.uri),
      [H_CONTENT_TYPE]: response.headers.get('content-type') || blob.type || '',
      [H_STORED_AT]: String(Date.now()),
      [H_BYTES]: String(blob.size),
    },
  });

  const cache = await openCache();
  await cache.put(new Request(keyFor(id)), stored);

  return {
    id,
    uri: source.uri,
    bytesDownloaded: blob.size,
    bytesTotal: blob.size,
    // A web download is atomic: the entry only exists once the whole body is
    // stored. There is no observable 'downloading' state, and a failure throws
    // instead of leaving an 'error' record behind.
    status: 'done',
  };
}

/** Deletes the entry for `id`. Resolves `false` if there was nothing to delete. */
export async function webRemoveDownload(id: string): Promise<boolean> {
  const cache = await openCache();
  return cache.delete(new Request(keyFor(id)));
}

/** Rebuilds `DownloadInfo[]` by enumerating the cache. */
export async function webGetDownloads(): Promise<DownloadInfo[]> {
  const cache = await openCache();
  const requests = await cache.keys();
  const out: DownloadInfo[] = [];

  for (const request of requests) {
    const id = idFromKey(request.url);
    if (id === null) continue; // an entry we did not write
    const bytes = await byteCountFor(cache, request);
    out.push({
      id,
      // The requested URI, not the cache key — a key is an implementation
      // detail and useless to a consumer building a download list.
      uri: (await entryUri(cache, request)) ?? '',
      bytesDownloaded: bytes,
      bytesTotal: bytes,
      status: 'done',
    });
  }

  return out;
}

async function byteCountFor(cache: Cache, request: Request): Promise<number> {
  const hit = await cache.match(request);
  if (!hit) return 0;
  // Prefer the recorded size: it is what was actually stored, and reading the
  // blob again to measure it would pull every entry through memory on every call.
  const recorded = Number(hit.headers.get(H_BYTES));
  if (Number.isFinite(recorded) && recorded > 0) return recorded;
  const length = Number(hit.headers.get('content-length'));
  return Number.isFinite(length) && length > 0 ? length : 0;
}

async function entryUri(cache: Cache, request: Request): Promise<string | null> {
  const hit = await cache.match(request);
  if (!hit) return null;
  const raw = hit.headers.get(H_URI);
  return raw == null ? null : safeDecode(raw);
}

/** Empties the store. */
export async function webClearCache(): Promise<void> {
  if (!isWebCacheStorageSupported()) return;
  await caches.delete(CACHE_NAME);
}

/**
 * Total stored bytes.
 *
 * Summed from the recorded size of each entry, so it does not read every blob
 * into memory. A cache written by another version of this library (or by
 * something else using the same cache name) has no recorded size and contributes
 * its `Content-Length` if the origin sent one, and 0 otherwise.
 */
export async function webGetCacheSize(): Promise<number> {
  if (!isWebCacheStorageSupported()) return 0;
  const cache = await openCache();
  const requests = await cache.keys();
  let total = 0;
  for (const request of requests) {
    total += await byteCountFor(cache, request);
  }
  return total;
}
