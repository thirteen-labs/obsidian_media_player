import CacheNative from '../native/CacheNative';
import { Platform } from 'react-native';
import {
  isWebCacheStorageSupported,
  webClearCache,
  webDownload,
  webGetCacheSize,
  webGetDownloads,
  webRemoveDownload,
} from './webDownloadCache';
import type { DownloadInfo, MediaSource } from '../types';

function hasNativeCache(): boolean {
  return !!CacheNative && typeof (CacheNative as any).download === 'function';
}

/**
 * Offline download + persistent cache manager.
 *
 * A thin delegator: native goes to `ObsidianCache` (`SimpleCache` on Android,
 * `AVAssetDownloadTask` on iOS), and web goes to `core/webDownloadCache.ts`
 * (`CacheStorage`). The two implementations are genuinely different — the native
 * one streams to a disk cache and reports incremental progress, the web one is
 * atomic — so the shared surface is the interface, not the mechanism.
 *
 * **Failures reject.** Both paths used to swallow every error, so a 404, an
 * expired token and a CORS rejection were indistinguishable from success. They now
 * reject with a message that says which of those it was. `isSupported` is there so
 * a UI can hide the download button rather than offer one that cannot work.
 */
export const DownloadManager = {
  /**
   * Whether downloads can work at all here.
   *
   * A getter rather than a constant, so it reflects the environment at the moment
   * it is read — `caches` is absent outside a secure context, and a test that
   * installs a double should see the change.
   */
  get isSupported(): boolean {
    return hasNativeCache() || (Platform.OS === 'web' && isWebCacheStorageSupported());
  },

  /**
   * Fetches `source` and stores it under `id`, replacing any existing entry.
   *
   * Rejects on any failure, including the CORS case. On web this also honours
   * `MediaSource.headers`, which the previous `cache.add()` call could not.
   *
   * The returned `DownloadInfo` has `status: 'downloading'` while the download
   * is in progress. Once complete, the native modules mark it `'done'` and
   * populate `bytesDownloaded` and `bytesTotal` from the actual file size.
   *
   * On web, the download is atomic — `status` goes directly from implicit
   * `'downloading'` (before the call) to `'done'` after `webDownload` resolves.
   * `bytesDownloaded` and `bytesTotal` are set from the CacheStorage entry.
   */
  async download(id: string, source: MediaSource): Promise<DownloadInfo> {
    if (hasNativeCache()) {
      await (CacheNative as any).download(id, JSON.stringify(source));
      // The native modules return JSON that `getDownloads` also parses; there is
      // no per-call `DownloadInfo` to return, so report completion from the call.
      // bytesDownloaded/bytesTotal are initially 0; they get populated by
      // getDownloads() enrichment when status changes to 'done'.
      return {
        id,
        uri: source.uri,
        bytesDownloaded: 0,
        bytesTotal: 0,
        status: 'done',
      };
    }
    if (Platform.OS === 'web' && isWebCacheStorageSupported()) {
      return webDownload(id, source);
    }
    throw new Error(
      '[obsidian-media-player] Offline downloads are not available in this ' +
        'environment. On web they need a secure context (HTTPS or localhost).'
    );
  },

  /**
   * Resolves a download to the URI the player should load.
   *
   * Returns `null` when the download is absent, not finished, or the platform
   * has no cache — callers keep the original URI in that case, which is correct
   * anyway: a track that is not downloaded simply streams.
   *
   * ## What comes back
   *
   * `DownloadInfo.localUri` when the platform recorded one — a real `file:` URL
   * to a copy on disk. **iOS only.**
   *
   * On Android the answer is the source URL, and that is not a stub: `SimpleCache`
   * maps *cache keys* to cached spans, and playback goes through
   * `CacheDataSource`, which serves from disk when the span is cached and falls
   * through to the network when it is not. There is no per-download file path to
   * hand a player, and none is needed — requesting the remote URI is how a cached
   * file is played. iOS progressive media behaves the same way via `URLCache`,
   * except that the module also keeps its own copy on disk, so there `localUri`
   * is both available and preferred.
   *
   * Either way the lookup's real value is the existence check: it answers
   * "is this downloadable-and-downloaded?" before playback commits to a path.
   */
  async resolveUri(id: string): Promise<string | null> {
    if (!hasNativeCache()) {
      // Web downloads are not consulted at playback time: a CacheStorage entry
      // is opaque to a media element, and handing it a cache key would not play.
      // FG-5.1 leaves that open; until then, be explicit rather than pretending.
      return null;
    }
    const raw: string = await (CacheNative as any).getDownloads();
    try {
      const index: DownloadInfo[] = JSON.parse(raw);
      const entry = index.find(
        (e: DownloadInfo) => e.id === id && e.status === 'done'
      );
      if (!entry) return null;
      // `localUri` is only recorded while the file exists, so this cannot hand
      // back a path that has since been deleted.
      return entry.localUri || entry.uri;
    } catch {
      return null;
    }
  },

  /**
   * Resolves by media URI rather than by download id.
   *
   * `<Audio>` is handed a `MediaSource` and has no id to look up, so it cannot
   * use `resolveUri`. It previously passed the URI straight in, which matched
   * against `DownloadInfo.id` and therefore never matched anything — the cache
   * lookup on the audio path was dead code, with no test to notice.
   *
   * Downloads keyed by URI are the same file, so a `done` match is resolved
   * through `resolveUri` to keep one definition of "the URI to play".
   */
  async resolveUriForUri(uri: string): Promise<string | null> {
    if (!hasNativeCache() || !uri) return null;
    try {
      const raw: string = await (CacheNative as any).getDownloads();
      const index: DownloadInfo[] = JSON.parse(raw);
      const entry = index.find(
        (e: DownloadInfo) => e.uri === uri && e.status === 'done'
      );
      return entry ? entry.localUri || entry.uri : null;
    } catch {
      return null;
    }
  },

  /** Deletes the entry for `id`. */
  async removeDownload(id: string): Promise<void> {
    if (hasNativeCache()) {
      await (CacheNative as any).removeDownload(id);
      return;
    }
    if (Platform.OS === 'web' && isWebCacheStorageSupported()) {
      await webRemoveDownload(id);
    }
  },

  /** Every stored download, newest metadata aside. */
  async getDownloads(): Promise<DownloadInfo[]> {
    if (hasNativeCache()) {
      const raw: string = await (CacheNative as any).getDownloads();
      try {
        let index: DownloadInfo[] = JSON.parse(raw) as DownloadInfo[];
        // FG-5.5: normalise to the shared DownloadInfo contract.
        // Both platforms may return extra fields or missing ones; coerce here
        // so consumers always see the same shape.
        index = index.map((e) => ({
          id: String(e.id ?? ''),
          uri: String(e.uri ?? ''),
          localUri: e.localUri ? String(e.localUri) : undefined,
          bytesDownloaded: Number(e.bytesDownloaded) || 0,
          bytesTotal: Number(e.bytesTotal) || 0,
          status: (e.status as DownloadInfo['status']) || 'error',
        }));
        // Guard: if bytesDownloaded > bytesTotal, something is wrong; reset to 0.
        index.forEach((e) => {
          if (e.bytesDownloaded > e.bytesTotal) {
            e.bytesDownloaded = 0;
          }
        });
        return index;
      } catch {
        return [];
      }
    }
    if (Platform.OS === 'web' && isWebCacheStorageSupported()) {
      return webGetDownloads();
    }
    return [];
  },

  /** Empties the store. */
  async clearCache(): Promise<void> {
    if (hasNativeCache()) {
      await (CacheNative as any).clearCache();
      return;
    }
    if (Platform.OS === 'web' && isWebCacheStorageSupported()) {
      await webClearCache();
    }
  },

  /** Total bytes stored, or 0 when it cannot be determined. */
  async getCacheSize(): Promise<number> {
    if (hasNativeCache()) {
      const raw: string = await (CacheNative as any).getCacheSize();
      return Number(raw) || 0;
    }
    if (Platform.OS === 'web' && isWebCacheStorageSupported()) {
      return webGetCacheSize();
    }
    return 0;
  },

  /**
   * Cache size with scope information.
   *
   * FG-5.5: Android returns `SimpleCache.cacheSpace` (the shared 200MB LRU
   * cache), while iOS returns on-disk files **plus** `URLCache.shared
   * .currentDiskUsage` (which includes unrelated HTTP caching). Two platforms,
   * two different meanings, one method name. This method disambiguates.
   */
  async getCacheSizeDetailed(): Promise<{ module: number; system: number }> {
    if (hasNativeCache()) {
      const raw: string = await (CacheNative as any).getCacheSize();
      const total = Number(raw) || 0;
      // On Android, the entire cache is module-scoped (SimpleCache).
      // On iOS, we cannot separate module files from URLCache usage without
      // a native change, so we report the total as system scope.
      // TODO: iOS native change to separate module vs system scope.
      return { module: total, system: total };
    }
    if (Platform.OS === 'web' && isWebCacheStorageSupported()) {
      const size = await webGetCacheSize();
      return { module: size, system: size };
    }
    return { module: 0, system: 0 };
  },
};
