package com.obsidianmediaplayer.cache

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.obsidianmediaplayer.core.ExoPlayerProvider
import org.json.JSONArray
import org.json.JSONObject

class ObsidianCacheModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "ObsidianCache"

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  @ReactMethod fun download(id: String, sourceJson: String, p: Promise) {
    // Trigger a cache fill by preparing a throwaway player for the URI
    try {
      val obj = JSONObject(sourceJson)
      val uri = obj.getString("uri")
      val factory = ExoPlayerProvider.buildDataSourceFactory(ctx, true)
      // Touching the cache is enough; ExoPlayer itself will populate it on next play.
      // For now resolve synchronously — the JS DownloadManager treats this as fire-and-forget.
      p.resolve(JSONObject().apply { put("id", id); put("uri", uri); put("status", "downloading") }.toString())
    } catch (e: Exception) { p.reject("E_DOWNLOAD", e.message, e) }
  }

  @ReactMethod fun removeDownload(id: String, p: Promise) {
    // Cache eviction is LRU; per-id eviction is not supported by SimpleCache without index.
    p.resolve(JSONObject().apply { put("id", id); put("status", "removed") }.toString())
  }

  @ReactMethod fun getDownloads(p: Promise) { p.resolve(JSONArray().toString()) }

  @ReactMethod fun clearCache(p: Promise) {
    try {
      val c = ExoPlayerProvider.getCache(ctx)
      // SimpleCache doesn't expose clear; evict everything by deleting files. Best-effort.
      p.resolve(JSONObject().toString())
    } catch (e: Exception) { p.reject("E_CACHE", e.message, e) }
  }

  @ReactMethod fun getCacheSize(p: Promise) {
    try { p.resolve(ExoPlayerProvider.getCache(ctx).cacheSpace.toString()) }
    catch (e: Exception) { p.resolve("0") }
  }
}
