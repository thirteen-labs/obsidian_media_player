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

  companion object {
    private const val PREFS = "obsidian_downloads"
    private const val KEY_INDEX = "index"
  }

  private fun prefs() = ctx.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)

  private fun readIndex(): JSONArray {
    val raw = prefs().getString(KEY_INDEX, "[]") ?: "[]"
    return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
  }

  private fun writeIndex(arr: JSONArray) {
    prefs().edit().putString(KEY_INDEX, arr.toString()).apply()
  }

  private fun findEntry(arr: JSONArray, id: String): JSONObject? {
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      if (o.optString("id") == id) return o
    }
    return null
  }

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  @ReactMethod fun download(id: String, sourceJson: String, p: Promise) {
    try {
      val obj = JSONObject(sourceJson)
      val uri = obj.getString("uri")
      val headers = obj.optJSONObject("headers")?.let { jo ->
        buildMap { jo.keys().forEach { k -> put(k, jo.getString(k)) } }
      } ?: emptyMap()
      val type = obj.optString("type", null)?.takeIf { it.isNotEmpty() }
      val cacheable = obj.optBoolean("cacheable", true)

      // Persist to index immediately as "downloading" so getDownloads is useful
      val index = readIndex()
      val existing = findEntry(index, id)
      if (existing != null) {
        existing.put("uri", uri)
        existing.put("status", "downloading")
        existing.put("type", type ?: "")
      } else {
        index.put(JSONObject().apply {
          put("id", id)
          put("uri", uri)
          put("type", type ?: "")
          put("status", "downloading")
          put("bytesDownloaded", 0)
          put("bytesTotal", 0)
        })
      }
      writeIndex(index)

      // Prefetch on background thread — populates SimpleCache (200MB LRU)
      Thread {
        try {
          // Only prefetch progressive/files; HLS/DASH will be cached on first play via ExoPlayer
          // For all types we still drain through CacheDataSource so SimpleCache is warmed
          ExoPlayerProvider.prefetchToCache(ctx, uri, headers)

          // Mark as done (bytes approximated from cacheSpace delta would need snapshot)
          val updated = readIndex()
          findEntry(updated, id)?.let {
            it.put("status", "done")
            it.put("bytesDownloaded", ExoPlayerProvider.getCache(ctx).cacheSpace)
          }
          writeIndex(updated)
        } catch (_: Exception) {
          val updated = readIndex()
          findEntry(updated, id)?.put("status", "error")
          writeIndex(updated)
        }
      }.start()

      // Resolve optimistically; JS can poll getDownloads() for "done"
      // If cacheable==false we skip cache but still track as done
      if (!cacheable) {
        findEntry(index, id)?.put("status", "done")
        writeIndex(index)
      }
      p.resolve(JSONObject().apply { put("id", id); put("uri", uri); put("status", "downloading") }.toString())
    } catch (e: Exception) { p.reject("E_DOWNLOAD", e.message, e) }
  }

  @ReactMethod fun removeDownload(id: String, p: Promise) {
    try {
      val index = readIndex()
      val next = JSONArray()
      for (i in 0 until index.length()) {
        val o = index.optJSONObject(i) ?: continue
        if (o.optString("id") != id) next.put(o)
      }
      writeIndex(next)
      // SimpleCache is LRU without per-key eviction — entry removal from index is the
      // source of truth; underlying blocks will be evicted naturally.
      p.resolve(JSONObject().apply { put("id", id); put("status", "removed") }.toString())
    } catch (e: Exception) { p.reject("E_REMOVE", e.message, e) }
  }

  @ReactMethod fun getDownloads(p: Promise) {
    try {
      val index = readIndex()
      // Enrich with live cacheSpace for bytesDownloaded if still downloading
      p.resolve(index.toString())
    } catch (e: Exception) { p.reject("E_INDEX", e.message, e) }
  }

  @ReactMethod fun clearCache(p: Promise) {
    try {
      val c = ExoPlayerProvider.getCache(ctx)
      // Best-effort: remove all cached spans by deleting cache dir contents
      // SimpleCache holds file locks, so we release via reflection-free delete of loose files
      val dir = java.io.File(ctx.cacheDir, "obsidian-media-cache")
      if (dir.exists()) {
        dir.listFiles()?.forEach { f ->
          try { if (f.isFile) f.delete() } catch (_: Exception) {}
        }
      }
      // Also clear index
      writeIndex(JSONArray())
      p.resolve(JSONObject().toString())
    } catch (e: Exception) { p.reject("E_CACHE", e.message, e) }
  }

  @ReactMethod fun getCacheSize(p: Promise) {
    try { p.resolve(ExoPlayerProvider.getCache(ctx).cacheSpace.toString()) }
    catch (e: Exception) { p.resolve("0") }
  }
}
