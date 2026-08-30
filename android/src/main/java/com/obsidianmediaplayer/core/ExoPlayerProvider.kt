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
        .setCacheWriteDataSinkFactory(null)
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    } else {
      CacheDataSource.Factory().setCache(null).setUpstreamDataSourceFactory(upstream)
    } as CacheDataSource.Factory
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
    val httpFactory = if (headers.isNotEmpty()) {
      DefaultHttpDataSource.Factory().apply { setDefaultRequestProperties(headers) }
    } else null

    val upstream: DefaultDataSource.Factory = DefaultDataSource.Factory(context).apply {
      httpFactory?.let { /* per-source headers already in httpFactory */ }
    }

    val cacheFactory = if (cacheable) {
      CacheDataSource.Factory().setCache(getCache(context))
        .setUpstreamDataSourceFactory(httpFactory ?: upstream)
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    } else {
      CacheDataSource.Factory().setCache(null)
        .setUpstreamDataSourceFactory(httpFactory ?: upstream)
    }

    // DRM would be wired here via DefaultDrmSessionManager + HttpMediaDrmCallback(drmLicenseUri)
    // if (drmLicenseUri != null) { ... }

    return when (type) {
      "hls" -> HlsMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
      "dash" -> DashMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
      else -> ProgressiveMediaSource.Factory(cacheFactory).createMediaSource(mediaItem)
    }
  }
}
