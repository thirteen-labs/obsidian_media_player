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

/**
 * Shared ExoPlayer factory + disk cache. Reused by Video, Audio and Music
 * surfaces. HLS/DASH are picked automatically by ExoPlayer's adaptive
 * MediaSource factories.
 */
object ExoPlayerProvider {
  private var cache: SimpleCache? = null

  fun getCache(context: Context): SimpleCache {
    cache?.let { return it }
    val dir = File(context.cacheDir, "obsidian-media-cache")
    dir.mkdirs()
    val evictor = LeastRecentlyUsedCacheEvictor(200L * 1024 * 1024) // 200 MB
    val created = SimpleCache(dir, evictor, StandaloneDatabaseProvider(context))
    cache = created
    return created
  }

  fun buildDataSourceFactory(context: Context, cacheable: Boolean): CacheDataSource.Factory {
    val upstream = DefaultDataSource.Factory(context)
    return if (cacheable) {
      CacheDataSource.Factory()
        .setCache(getCache(context))
        .setUpstreamDataSourceFactory(upstream)
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    } else {
      CacheDataSource.Factory().setCache(null).setUpstreamDataSourceFactory(upstream)
    } as CacheDataSource.Factory
  }

  /**
   * Offline download helper — pre-warms the disk cache by opening the URL
   * through CacheDataSource. Used by ObsidianCacheModule.download().
   * Non-blocking: caller should resolve JS promise after this call.
   */
  fun prefetchToCache(context: Context, uri: String, headers: Map<String, String> = emptyMap()) {
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
      try {
        dataSource.open(dataSpec)
        val buffer = ByteArray(32 * 1024)
        while (dataSource.read(buffer, 0, buffer.size) != -1) { /* drain to populate cache */ }
      } finally {
        dataSource.close()
      }
    } catch (_: Exception) {
      // best-effort: cache fill failures are ignored, playback will still work
    }
  }

  fun buildPlayer(context: Context): ExoPlayer =
    ExoPlayer.Builder(context).build()

  @UnstableApi
  fun buildMediaSource(
    context: Context,
    mediaItem: MediaItem,
    headers: Map<String, String> = emptyMap(),
    type: String? = null,
    cacheable: Boolean = true,
    drmLicenseUri: String? = null,
  ): MediaSource {
    // Per-source headers go through DefaultHttpDataSource.Factory
    val httpFactory = if (headers.isNotEmpty()) {
      DefaultHttpDataSource.Factory().apply { setDefaultRequestProperties(headers) }
    } else null

    val upstreamFactory = httpFactory ?: DefaultDataSource.Factory(context)

    val cacheFactory = if (cacheable) {
      CacheDataSource.Factory().setCache(getCache(context))
        .setUpstreamDataSourceFactory(upstreamFactory)
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    } else {
      CacheDataSource.Factory().setCache(null)
        .setUpstreamDataSourceFactory(upstreamFactory)
    }

    // DRM hook: when drmLicenseUri is present, a DefaultDrmSessionManager
    // with HttpMediaDrmCallback would be attached to the MediaItem's
    // DrmConfiguration. Kept as pass-through here (mediaItem already carries
    // drmConfiguration if JS set drmLicenseUri) so offline cache still works
    // without requiring Widevine entitlement. Full Widevine is roadmap #2.
    if (drmLicenseUri != null) {
      // Future: mediaItem.drmConfiguration = MediaItem.DrmConfiguration.Builder(C.WIDEVINE_UUID)
      //   .setLicenseUri(drmLicenseUri).build()
    }

    return when (type?.lowercase()) {
      "hls" -> HlsMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
      "dash" -> DashMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
      // "smooth" -> SsMediaSource.Factory(cacheFactory).createMediaSource(mediaItem) — requires media3-exoplayer-smoothstreaming
      "smooth" -> ProgressiveMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
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
