package com.obsidianmediaplayer.core

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit

/**
 * Shared ExoPlayer factory + disk cache. Reused by Video, Audio and Music
 * surfaces. HLS/DASH are picked automatically by ExoPlayer's adaptive
 * MediaSource factories.
 */
object ExoPlayerProvider {
  private var cache: SimpleCache? = null

  /**
   * Shared executor for all prefetch downloads. FG-5.4: ten downloads no longer
   * spawn ten unbounded threads — they share a fixed pool.
   */
  private val downloadExecutor = Executors.newFixedThreadPool(3)

  /**
   * Active prefetch futures, keyed by download id. Allows cancellation via
   * [cancelPrefetch].
   */
  private val activePrefetches = ConcurrentHashMap<String, Future<*>>()

  /** Maximum bytes to prefetch in a single download (2 GB). */
  private val MAX_PREFETCH_BYTES = 2L * 1024 * 1024 * 1024

  /** Timeout for a single prefetch operation (30 seconds). */
  private val PREFETCH_TIMEOUT_SECONDS = 30L

  fun getCache(context: Context): SimpleCache {
    cache?.let { return it }
    val dir = File(context.cacheDir, "obsidian-media-cache")
    dir.mkdirs()
    val evictor = LeastRecentlyUsedCacheEvictor(200L * 1024 * 1024) // 200 MB
    val created = SimpleCache(dir, evictor, StandaloneDatabaseProvider(context))
    cache = created
    return created
  }

  /**
   * Release the shared SimpleCache and drop the reference so the next
   * getCache() rebuilds it. Only for the unsafe-clear path — prefer
   * removeResource() per key. Callers must have stopped playback first: an
   * ExoPlayer holding a CacheDataSource across release() will crash.
   */
  @Synchronized
  fun releaseCache() {
    try { cache?.release() } catch (_: Exception) { /* best-effort */ }
    cache = null
  }

  /**
   * The cache key an entry for [uri] is stored under.
   *
   * FG-5.1 step 3 asked for the assigned key to be recorded rather than assumed.
   * The assumption FG-4.5 left in place was "the key is the request URI as
   * written", and that is only *approximately* right: `SimpleCache` keys entries
   * with `CacheKey`, whose default implementation is `uri.toString()` — i.e. the
   * **parsed, normalised** URI, not the raw string. `Uri.parse` normalises
   * default ports and some percent-encodings, so a raw string and the key can
   * differ, and `removeResource` then silently evicts nothing.
   *
   * Note there is no accessor to ask: `SimpleCache.getCacheKey` and its
   * `cacheKey` field are internal in media3 1.3.1 (checked with `javap` against
   * `media3-datasource-1.3.1`), so the same derivation is applied here instead.
   * That is safe precisely because no caller ever sets `DataSpec.key`; if one
   * starts to, this must change with it.
   *
   * Falls back to the raw string if the URI will not parse, so a malformed
   * entry degrades to the previous behaviour rather than throwing mid-download.
   */
  fun cacheKeyFor(uri: String): String {
    return try {
      android.net.Uri.parse(uri).toString()
    } catch (_: Exception) {
      uri
    }
  }

  /**
   * True when the cache holds a cached span for [uri], so a caller can confirm a
   * download survived eviction rather than trusting the index alone.
   *
   * The index is written when a download completes, but `SimpleCache` is an LRU:
   * the entry can be evicted later while the index still says `"done"`. On iOS a
   * stale `localUri` is a real failure (a `file:` URL to a file that is gone), so
   * this is the check that keeps it from being handed to a player.
   */
  fun isCachedFor(context: Context, uri: String): Boolean {
    val c = cache ?: return false
    return try {
      c.isCached(cacheKeyFor(uri), 0, Long.MAX_VALUE)
    } catch (_: Exception) {
      false
    }
  }

  /**
   * Evict one resource by cache key. Returns true when spans were removed.
   * Entries written through buildMediaSource / prefetchToCache carry no custom
   * key, so the key is the normalised request URI — see [cacheKeyFor]. HLS
   * segment sets are not covered: they share the manifest URI key only for the
   * playlist itself.
   */
  fun removeResource(cacheKey: String): Boolean {
    val c = cache ?: return false
    return try { c.removeResource(cacheKey); true } catch (_: Exception) { false }
  }

  fun buildDataSourceFactory(context: Context, cacheable: Boolean): androidx.media3.datasource.DataSource.Factory {
    val upstream = DefaultDataSource.Factory(context)
    return if (cacheable) {
      CacheDataSource.Factory()
        .setCache(getCache(context))
        .setUpstreamDataSourceFactory(upstream)
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    } else {
      upstream
    }
  }

  /**
   * Offline download helper — pre-warms the disk cache by opening the URL
   * through CacheDataSource. Used by ObsidianCacheModule.download().
   *
   * FG-5.4: now runs on a shared [ExecutorService] with a timeout and size
   * ceiling. Returns a [Future] so the caller can cancel the download.
   *
   * Returns the number of bytes actually read from the data source, so the
   * caller can populate `bytesDownloaded` / `bytesTotal` with real values
   * instead of approximating from `cacheSpace`.
   */
  fun prefetchToCache(
    context: Context,
    uri: String,
    headers: Map<String, String> = emptyMap(),
    onProgress: ((bytesRead: Long) -> Unit)? = null,
  ): Future<Long> {
    val future = downloadExecutor.submit<Long> {
      try {
        val httpFactory = if (headers.isNotEmpty()) {
          DefaultHttpDataSource.Factory().apply { setDefaultRequestProperties(headers) }
        } else null
        val upstream = httpFactory ?: DefaultDataSource.Factory(context)
        val cacheFactory = CacheDataSource.Factory()
          .setCache(getCache(context))
          .setUpstreamDataSourceFactory(upstream)
          .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        val dataSource = cacheFactory.createDataSource()
        val dataSpec = androidx.media3.datasource.DataSpec(android.net.Uri.parse(uri))
        var totalBytes = 0L
        try {
          dataSource.open(dataSpec)
          val buffer = ByteArray(32 * 1024)
          var read: Int
          while (dataSource.read(buffer, 0, buffer.size).also { read = it } != -1) {
            totalBytes += read
            // Size ceiling: stop if we've read more than MAX_PREFETCH_BYTES
            if (totalBytes > MAX_PREFETCH_BYTES) {
              android.util.Log.w("ExoPlayerProvider", "Prefetch exceeded size ceiling for $uri")
              break
            }
            // Progress callback
            onProgress?.invoke(totalBytes)
          }
        } finally {
          dataSource.close()
        }
        totalBytes
      } catch (e: Exception) {
        // FG-5.4: log the exception instead of swallowing it silently
        android.util.Log.e("ExoPlayerProvider", "Prefetch failed for $uri", e)
        0L
      }
    }
    return future
  }

  /**
   * Cancel an in-flight prefetch by download id. Returns true if a prefetch
   * was found and cancelled.
   */
  fun cancelPrefetch(id: String): Boolean {
    val future = activePrefetches.remove(id) ?: return false
    return future.cancel(true)
  }

  fun buildPlayer(context: Context): ExoPlayer {
    // FG-4.0 step 4: audio focus lives here, not in each module. With
    // handleAudioFocus=true ExoPlayer requests focus on play and ducks/pauses
    // on loss; setHandleAudioBecomingNoisy pauses on headset disconnect.
    // WAKE_MODE_NETWORK keeps playback alive while streaming with the screen off.
    val audioAttributes = androidx.media3.common.AudioAttributes.Builder()
      .setUsage(androidx.media3.common.C.USAGE_MEDIA)
      .setContentType(androidx.media3.common.C.AUDIO_CONTENT_TYPE_MUSIC)
      .build()
    return ExoPlayer.Builder(context)
      .setAudioAttributes(audioAttributes, true)
      .setHandleAudioBecomingNoisy(true)
      .setWakeMode(androidx.media3.common.C.WAKE_MODE_NETWORK)
      .build()
  }

  @UnstableApi
  fun buildMediaSource(
    context: Context,
    mediaItem: MediaItem,
    headers: Map<String, String> = emptyMap(),
    type: String? = null,
    cacheable: Boolean = true,
  ): MediaSource {
    // Per-source headers go through DefaultHttpDataSource.Factory
    val httpFactory = if (headers.isNotEmpty()) {
      DefaultHttpDataSource.Factory().apply { setDefaultRequestProperties(headers) }
    } else null

    val upstreamFactory = httpFactory ?: DefaultDataSource.Factory(context)

    val cacheFactory: androidx.media3.datasource.DataSource.Factory = if (cacheable) {
      CacheDataSource.Factory().setCache(getCache(context))
        .setUpstreamDataSourceFactory(upstreamFactory)
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    } else {
      upstreamFactory
    }

    // NOTE: DRM is not supported. `MediaSource.drmLicenseUri` was removed in
    // 0.3.0 because it was a pure passthrough — it arrived here and was
    // discarded without ever configuring a DrmSessionManager, so protected
    // content failed with a bare network error. Widevine needs a real
    // DefaultDrmSessionManager + licence server; see to-be-done.md FG-6.1.

    return when (type?.lowercase()) {
      "hls" -> HlsMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
      "dash" -> DashMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
      "progressive", "file" -> ProgressiveMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
      null, "" -> {
        // Auto-detect: let ExoPlayer infer from URI / MIME
        val uri = mediaItem.localConfiguration?.uri?.toString()?.lowercase() ?: ""
        when {
          uri.contains(".m3u8") -> HlsMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
          uri.contains(".mpd") -> DashMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
          else -> ProgressiveMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
        }
      }
      else -> ProgressiveMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
    }
  }
}
