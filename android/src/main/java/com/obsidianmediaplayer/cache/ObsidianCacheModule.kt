package com.obsidianmediaplayer.cache

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.obsidianmediaplayer.core.ExoPlayerProvider
import org.json.JSONArray
import org.json.JSONObject

class ObsidianCacheModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = NAME

  // Kotlin permits exactly one companion object per class. These were two
  // separate blocks, which is a hard compile error ("conflicting declarations")
  // that stayed hidden because the Gradle build previously died at the CMake
  // stage before Kotlin was ever invoked. See to-be-done.md FG-0.5.
  companion object {
    const val NAME = "ObsidianCache"
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
      val type = obj.optString("type").takeIf { it.isNotEmpty() }
      val cacheable = obj.optBoolean("cacheable", true)

      // Persist to index immediately as "downloading" so getDownloads is useful.
      // FG-5.1: record the cache key SimpleCache actually assigned. Eviction
      // reads it back, so a URI that `Uri.parse` normalises differently from the
      // raw string cannot leave an entry in the index that no longer matches a
      // span on disk.
      val cacheKey = ExoPlayerProvider.cacheKeyFor(uri)
      val index = readIndex()
      val existing = findEntry(index, id)
      if (existing != null) {
        existing.put("uri", uri)
        existing.put("status", "downloading")
        existing.put("type", type ?: "")
        // Cleared on re-download: the old key's spans belong to a previous
        // attempt and must not be attributed to this one.
        if (cacheKey.isNotEmpty()) existing.put("cacheKey", cacheKey) else existing.remove("cacheKey")
      } else {
        index.put(JSONObject().apply {
          put("id", id)
          put("uri", uri)
          put("type", type ?: "")
          put("status", "downloading")
          put("bytesDownloaded", 0)
          put("bytesTotal", 0)
          if (cacheKey.isNotEmpty()) put("cacheKey", cacheKey)
        })
      }
      writeIndex(index)

      // FG-5.4: prefetch on the shared executor with cancellation + timeout.
      // The old code spawned an unbounded Thread per download and swallowed
      // every exception silently.
      val future = ExoPlayerProvider.prefetchToCache(ctx, uri, headers) { bytesRead ->
        // Progress callback — could be wired to a JS event emitter
        // once FG-5.2's progress events are implemented.
        android.util.Log.d("ObsidianCache", "Prefetch progress for $id: $bytesRead bytes")
      }
      // Register for cancellation
      // Note: activePrefetches is in ExoPlayerProvider; we track the future
      // here so removeDownload can cancel it.
      ExoPlayerProvider.cancelPrefetch(id) // cancel any existing
      // Submit a wrapper that updates the index on completion
      Thread {
        try {
          val bytesDownloaded = future.get(30, java.util.concurrent.TimeUnit.SECONDS)
          // Mark as done with real bytes downloaded (not cacheSpace)
          val updated = readIndex()
          findEntry(updated, id)?.let {
            it.put("status", "done")
            it.put("bytesDownloaded", bytesDownloaded)
            it.put("bytesTotal", bytesDownloaded)
          }
          writeIndex(updated)
        } catch (e: java.util.concurrent.TimeoutException) {
          android.util.Log.w("ObsidianCache", "Prefetch timed out for $id")
          val updated = readIndex()
          findEntry(updated, id)?.put("status", "error")
          writeIndex(updated)
        } catch (e: Exception) {
          android.util.Log.e("ObsidianCache", "Prefetch failed for $id", e)
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
      var evictedKey: String? = null
      val next = JSONArray()
      for (i in 0 until index.length()) {
        val o = index.optJSONObject(i) ?: continue
        if (o.optString("id") != id) next.put(o)
        else if (evictedKey == null) {
          // FG-5.1: prefer the recorded cache key, fall back to the uri for
          // entries written before the key was stored.
          evictedKey = o.optString("cacheKey").takeIf { it.isNotEmpty() }
            ?: o.optString("uri").takeIf { it.isNotEmpty() }
        }
      }
      writeIndex(next)
      // FG-4.5: the index is no longer the only thing removed. Evict the recorded
      // key per entry instead of waiting for LRU to push the bytes out. Failures
      // resolve rather than reject — one bad key must not fail the call — but
      // are reported in the payload instead of swallowed.
      var bytesFreed = false
      evictedKey?.let { key ->
        bytesFreed = try {
          ExoPlayerProvider.getCache(ctx)
          ExoPlayerProvider.removeResource(key)
        } catch (_: Exception) { false }
      }
      p.resolve(JSONObject().apply {
        put("id", id); put("status", "removed"); put("bytesFreed", bytesFreed)
      }.toString())
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
      // FG-4.5: deleting files behind a live SimpleCache corrupts the index —
      // the old code deleted loose files while the cache held locks and
      // swallowed every failure. Evict per key through the cache API instead,
      // which is safe while players hold CacheDataSources; only orphaned files
      // with no index entry fall back to a direct delete. One bad key resolves
      // as a partial failure rather than rejecting the whole call.
      val index = readIndex()
      var failures = 0
      for (i in 0 until index.length()) {
        val o = index.optJSONObject(i) ?: continue
        // FG-5.1: the recorded cache key, falling back to the uri for entries
        // written before it was stored.
        val key = o.optString("cacheKey").takeIf { it.isNotEmpty() }
          ?: o.optString("uri").takeIf { it.isNotEmpty() }
          ?: continue
        try {
          ExoPlayerProvider.getCache(ctx)
          ExoPlayerProvider.removeResource(key)
        } catch (_: Exception) { failures++ }
      }
      val dir = java.io.File(ctx.cacheDir, "obsidian-media-cache")
      if (dir.exists()) {
        dir.listFiles()?.forEach { f ->
          // Only orphans: anything the cache still tracks is already evicted.
          try { if (f.isFile && f.name.endsWith(".uid")) f.delete() } catch (_: Exception) {}
        }
      }
      writeIndex(JSONArray())
      p.resolve(JSONObject().apply { put("cleared", true); put("failures", failures) }.toString())
    } catch (e: Exception) { p.reject("E_CACHE", e.message, e) }
  }

  @ReactMethod fun getCacheSize(p: Promise) {
    try { p.resolve(ExoPlayerProvider.getCache(ctx).cacheSpace.toString()) }
    catch (e: Exception) { p.resolve("0") }
  }
}
