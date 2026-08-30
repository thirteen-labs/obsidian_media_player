import CacheNative from '../native/CacheNative';
import { Platform } from 'react-native';
import type { MediaSource } from '../types';

export interface DownloadInfo {
  id: string;
  uri: string;
  bytesDownloaded: number;
  bytesTotal: number;
  status: 'downloading' | 'done' | 'error';
}

function hasNativeCache(): boolean {
  return !!CacheNative && typeof (CacheNative as any).download === 'function';
}

/**
 * Offline download + persistent cache manager. On native it delegates to
 * ObsidianCache (SimpleCache on Android, AVAssetDownloadTask on iOS). On web
 * and when the native module is not linked it falls back to CacheStorage
 * (best-effort) and otherwise no-ops.
 */
export const DownloadManager = {
  async download(id: string, source: MediaSource): Promise<void> {
    if (hasNativeCache()) {
      await (CacheNative as any).download(id, JSON.stringify(source));
      return;
    }
    if (Platform.OS === 'web' && 'caches' in globalThis) {
      try {
        const cache = await (caches as any).open('obsidian-media');
        await cache.add(source.uri);
      } catch {}
    }
  },

  async removeDownload(id: string): Promise<void> {
    if (hasNativeCache()) {
      await (CacheNative as any).removeDownload(id);
      return;
    }
    // web fallback: best-effort eviction not tracked per-id
  },

  async getDownloads(): Promise<DownloadInfo[]> {
    if (hasNativeCache()) {
      const raw: string = await (CacheNative as any).getDownloads();
      try { return JSON.parse(raw) as DownloadInfo[]; } catch { return []; }
    }
    return [];
  },

  async clearCache(): Promise<void> {
    if (hasNativeCache()) { await (CacheNative as any).clearCache(); return; }
    if (Platform.OS === 'web' && 'caches' in globalThis) {
      try { await (caches as any).delete('obsidian-media'); } catch {}
    }
  },

  async getCacheSize(): Promise<number> {
    if (hasNativeCache()) {
      const raw: string = await (CacheNative as any).getCacheSize();
      return Number(raw) || 0;
    }
    return 0;
  },
};
