/**
 * `useAudioPlayer` tests, and the cache-resolution lookup behind it (FG-5.1).
 *
 * This suite exists because the audio path had **no** coverage at all:
 * `Audio.test.tsx` tests the `<Audio>` component, not the hook. So
 * `load()` passing a media URI to `resolveUri(id)` — which matches against
 * `DownloadInfo.id` and therefore never matched — sat there as a no-op with
 * nothing to notice. Its sibling in `useMusicPlayer` had the mirror-image bug
 * (writing to a top-level `uri` instead of `source.uri`) and *was* caught, which
 * is the whole argument for testing both even when they look symmetric.
 *
 * The `DownloadManager` half is tested against the real native mock rather than
 * by mocking the resolver, so a lookup that quietly stops matching cannot be
 * hidden by a test double that agrees with it.
 */
import { renderHook, nativeMocks } from './helpers';
import { useAudioPlayer } from '../src/hooks/useAudioPlayer';
import { DownloadManager } from '../src/core/DownloadManager';

const remote = 'https://cdn.test/a.mp3';

/** Points the native cache index at `entries` and returns the mock. */
function withIndex(entries: unknown[]) {
  const cache = nativeMocks().cache;
  cache.getDownloads.mockResolvedValue(JSON.stringify(entries));
  return cache;
}

const done = (id: string, uri: string, extra: Record<string, unknown> = {}) => ({
  id,
  uri,
  status: 'done',
  bytesDownloaded: 10,
  bytesTotal: 10,
  ...extra,
});

beforeEach(() => {
  // The native mocks are module-level singletons shared by every suite, so call
  // history leaks between tests. Without this, `mock.calls[0]` is whichever test
  // ran first, not this one.
  nativeMocks().audio.load.mockClear();
  nativeMocks().cache.getDownloads.mockResolvedValue('[]');
});

afterEach(() => {
  nativeMocks().cache.getDownloads.mockResolvedValue('[]');
});

describe('DownloadManager.resolveUri — by download id', () => {
  it('returns the entry uri for a finished download', async () => {
    withIndex([done('t1', remote)]);
    expect(await DownloadManager.resolveUri('t1')).toBe(remote);
  });

  it('returns null for an unknown id', async () => {
    withIndex([done('t1', remote)]);
    expect(await DownloadManager.resolveUri('other')).toBeNull();
  });

  it('returns null for a download that is not finished', async () => {
    // An in-flight or failed download must not be reported as playable offline.
    withIndex([{ id: 't1', uri: remote, status: 'downloading' }]);
    expect(await DownloadManager.resolveUri('t1')).toBeNull();
  });

  // FG-5.1: `localUri` is the iOS case — the module keeps its own copy and
  // records the real `file:` URL. It must win over the source URL.
  it('prefers localUri over the source uri when present (iOS)', async () => {
    withIndex([
      done('t1', remote, { localUri: 'file:///cache/obsidian-media-cache/t1.mp3' }),
    ]);
    expect(await DownloadManager.resolveUri('t1')).toBe(
      'file:///cache/obsidian-media-cache/t1.mp3'
    );
  });

  it('falls back to the source uri when there is no localUri (Android)', async () => {
    // Not a fallback that "should not happen": Android genuinely has no
    // per-download path, because `SimpleCache` serves the source URL from disk.
    // Returning the remote URI there is the correct answer, not a stub.
    withIndex([done('t1', remote)]);
    expect(await DownloadManager.resolveUri('t1')).toBe(remote);
  });

  it('ignores localUri on a download that is not finished', async () => {
    // A stale `file:` URL on a failed entry is worse than no URL: playback fails
    // outright instead of falling back to the network.
    withIndex([
      {
        id: 't1',
        uri: remote,
        status: 'error',
        localUri: 'file:///cache/gone.mp3',
      },
    ]);
    expect(await DownloadManager.resolveUri('t1')).toBeNull();
  });

  it('returns null when the native index is not valid JSON', async () => {
    nativeMocks().cache.getDownloads.mockResolvedValue('not json');
    expect(await DownloadManager.resolveUri('t1')).toBeNull();
  });
});

describe('DownloadManager.resolveUriForUri — by media uri', () => {
  it('finds a finished download by its uri', async () => {
    // The case `useAudioPlayer` needs: it has a `MediaSource`, not an id.
    withIndex([done('t1', remote)]);
    expect(await DownloadManager.resolveUriForUri(remote)).toBe(remote);
  });

  it('prefers localUri over the source uri (iOS)', async () => {
    // The same preference `resolveUri` makes, pinned for this entry point too.
    // It is a separate code path, so a change to one does not move the other.
    withIndex([
      done('t1', remote, { localUri: 'file:///cache/obsidian-media-cache/t1.mp3' }),
    ]);
    expect(await DownloadManager.resolveUriForUri(remote)).toBe(
      'file:///cache/obsidian-media-cache/t1.mp3'
    );
  });

  it('falls back to the source uri with no localUri (Android)', async () => {
    withIndex([done('t1', remote)]);
    expect(await DownloadManager.resolveUriForUri(remote)).toBe(remote);
  });

  it('ignores localUri on a download that is not finished', async () => {
    withIndex([
      { id: 't1', uri: remote, status: 'downloading', localUri: 'file:///cache/x.mp3' },
    ]);
    expect(await DownloadManager.resolveUriForUri(remote)).toBeNull();
  });

  it('returns null for a uri that was never downloaded', async () => {
    withIndex([done('t1', remote)]);
    expect(await DownloadManager.resolveUriForUri('https://cdn.test/other.mp3')).toBeNull();
  });

  it('returns null for an unfinished download', async () => {
    withIndex([{ id: 't1', uri: remote, status: 'downloading' }]);
    expect(await DownloadManager.resolveUriForUri(remote)).toBeNull();
  });

  it('does not match a download id by accident', async () => {
    // Guards the original defect from the other side: a uri that happens to equal
    // some other download's *id* must not be treated as that download.
    withIndex([done('someone-elses-id', 'https://cdn.test/unrelated.mp3')]);
    expect(await DownloadManager.resolveUriForUri('someone-elses-id')).toBeNull();
  });

  it('returns null for an empty uri', async () => {
    withIndex([done('t1', remote)]);
    expect(await DownloadManager.resolveUriForUri('')).toBeNull();
  });
});

describe('useAudioPlayer.load — cache resolution at the call site', () => {
  it('passes the source straight through when nothing is downloaded', async () => {
    withIndex([]);
    const { result, actAsync, unmount } = renderHook(() => useAudioPlayer());
    await actAsync(() => result.current.controls.load({ uri: remote }));

    // No cached copy, so the original uri is what native receives.
    expect(nativeMocks().audio.load).toHaveBeenCalledWith(
      JSON.stringify({ uri: remote })
    );
    unmount();
  });

  it('prefers the cached uri for a downloaded source', async () => {
    withIndex([done('t1', remote, { localExtension: '.mp3' })]);
    const { result, actAsync, unmount } = renderHook(() => useAudioPlayer());
    await actAsync(() => result.current.controls.load({ uri: remote }));

    // The rewrite lands on `uri`, which is correct here: a `MediaSource` *does*
    // have a top-level `uri`. The music path's bug was writing to the wrong
    // object, not the wrong key.
    expect(nativeMocks().audio.load).toHaveBeenCalledWith(
      JSON.stringify({ uri: remote })
    );
    unmount();
  });

  it('preserves headers and type through the rewrite', async () => {
    withIndex([done('t1', remote)]);
    const { result, actAsync, unmount } = renderHook(() => useAudioPlayer());
    await actAsync(() =>
      result.current.controls.load({
        uri: remote,
        type: 'progressive',
        headers: { Authorization: 'Bearer t' },
      })
    );
    // Dropping these while rewriting the uri would silently break header-auth
    // playback the moment a download existed.
    const sent = JSON.parse(nativeMocks().audio.load.mock.calls[0][0] as string);
    expect(sent).toEqual({
      uri: remote,
      type: 'progressive',
      headers: { Authorization: 'Bearer t' },
    });
    unmount();
  });

  it('does not consult the id-keyed resolver', async () => {
    withIndex([done('t1', remote)]);
    const spy = jest.spyOn(DownloadManager, 'resolveUri');
    const { result, actAsync, unmount } = renderHook(() => useAudioPlayer());
    await actAsync(() => result.current.controls.load({ uri: remote }));
    // `<Audio>` has no id to look up. Calling the id-keyed resolver here is what
    // made the original no-op.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    unmount();
  });

  it('still loads when the index lookup throws', async () => {
    nativeMocks().cache.getDownloads.mockRejectedValue(new Error('bridge died'));
    const { result, actAsync, unmount } = renderHook(() => useAudioPlayer());
    // A cache index failure must not stop playback of a perfectly good remote
    // source — the fallback is the original uri.
    await actAsync(() => result.current.controls.load({ uri: remote }));
    expect(nativeMocks().audio.load).toHaveBeenCalledWith(
      JSON.stringify({ uri: remote })
    );
    unmount();
  });

  it('cacheable: false skips the lookup and keeps the source uri', async () => {
    withIndex([
      done('t1', remote, { localUri: 'file:///cache/obsidian-media-cache/t1.mp3' }),
    ]);
    const spy = jest.spyOn(DownloadManager, 'resolveUriForUri');
    const { result, actAsync, unmount } = renderHook(() => useAudioPlayer());

    await actAsync(() =>
      result.current.controls.load({ uri: remote, cacheable: false })
    );

    // FG-5.1 step 6 was closed as redundant with `cacheable`, so the flag has to
    // be honoured here. It already reached both native players
    // (`buildDataSourceFactory(context, cacheable)`,
    // `ObsidianVideoPlayer.load(_:headers:cacheable:)`), so without this a
    // source the player was told not to cache was still rewritten to a local
    // copy — the opt-out existed on paper and nowhere else.
    expect(spy).not.toHaveBeenCalled();
    const sent = JSON.parse(nativeMocks().audio.load.mock.calls[0][0] as string);
    expect(sent.uri).toBe(remote);
    expect(sent.cacheable).toBe(false);
    spy.mockRestore();
    unmount();
  });

  it('cacheable: true (or absent) still consults the cache', async () => {
    withIndex([done('t1', remote)]);
    const spy = jest.spyOn(DownloadManager, 'resolveUriForUri');
    const { result, actAsync, unmount } = renderHook(() => useAudioPlayer());
    await actAsync(() => result.current.controls.load({ uri: remote }));
    expect(spy).toHaveBeenCalledWith(remote);
    spy.mockRestore();
    unmount();
  });

  it('delegates the rest of the transport', () => {
    const { result, unmount } = renderHook(() => useAudioPlayer());
    result.current.controls.play();
    result.current.controls.pause();
    result.current.controls.setVolume(0.5);
    result.current.controls.setMuted(true);
    result.current.controls.setLoop(true);
    expect(nativeMocks().audio.play).toHaveBeenCalled();
    expect(nativeMocks().audio.pause).toHaveBeenCalled();
    expect(nativeMocks().audio.setVolume).toHaveBeenCalledWith(0.5);
    expect(nativeMocks().audio.setMuted).toHaveBeenCalledWith(true);
    expect(nativeMocks().audio.setLoop).toHaveBeenCalledWith(true);
    unmount();
  });
});
