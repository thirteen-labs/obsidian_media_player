import { useEffect, useState, useCallback } from 'react';
import { DownloadManager } from '../core/DownloadManager';
import type { DownloadInfo } from '../types';

/**
 * Subscribe to download progress for a single download id.
 *
 * FG-5.2 / FG-5.5: the package has hooks for every other surface (video, audio,
 * music, remote controls) and downloads are the only one without one. This
 * hook fills that gap — it polls `DownloadManager.getDownloads()` and returns
 * the matching entry, plus a cancel function.
 *
 * Polling is used because the native modules do not yet emit progress events
 * (that is the remaining native work for FG-5.2). The poll interval is
 * 500ms, which is frequent enough for a progress bar without being wasteful.
 */
export function useDownload(id: string, pollIntervalMs = 500): {
  info: DownloadInfo | null;
  cancel: () => void;
} {
  const [info, setInfo] = useState<DownloadInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await DownloadManager.getDownloads();
      const entry = all.find((e) => e.id === id) ?? null;
      setInfo(entry);
    } catch {
      // Index read failure — keep previous info
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(timer);
  }, [refresh, pollIntervalMs]);

  const cancel = useCallback(() => {
    DownloadManager.removeDownload(id);
  }, [id]);

  return { info, cancel };
}
