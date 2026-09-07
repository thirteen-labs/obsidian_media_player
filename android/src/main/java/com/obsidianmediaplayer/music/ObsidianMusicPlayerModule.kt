package com.obsidianmediaplayer.music

import android.content.Intent
import android.os.Build
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.obsidianmediaplayer.core.ExoPlayerProvider
import org.json.JSONArray
import org.json.JSONObject

/**
 * Full-featured music player with queue, shuffle/repeat, background audio
 * (foreground Service + MediaSession) and lock-screen remote controls.
 * Registered as "ObsidianMusicPlayer".
 */
class ObsidianMusicPlayerModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = NAME

  companion object {
    const val NAME = "ObsidianMusicPlayer"
  }

  private val player: ExoPlayer by lazy { ExoPlayerProvider.buildPlayer(ctx) }
  private var mediaSession: MediaSession? = null

  private data class Track(
    val id: String,
    val uri: String,
    val headers: Map<String, String>,
    val title: String?,
    val artist: String?,
    val type: String?,
    val drmLicenseUri: String?,
    val cacheable: Boolean
  )

  private var tracks: MutableList<Track> = mutableListOf()
  private var order: MutableList<Int> = mutableListOf()
  private var cursor = 0
  private var repeatMode = "off"
  private var shuffle = false
  private val lastState = mutableMapOf<String, Any>(
    "status" to "idle", "position" to 0.0, "duration" to 0.0,
    "rate" to 1.0, "muted" to false, "volume" to 1.0,
    "buffered" to 0.0, "inBackground" to false
  )

  private val listener = object : Player.Listener {
    override fun onPlaybackStateChanged(state: Int) {
      lastState["status"] = when (state) {
        Player.STATE_READY -> if (player.playWhenReady) "playing" else "ready"
        Player.STATE_BUFFERING -> "buffering"
        Player.STATE_ENDED -> "ended"
        else -> "loading"
      }
      if (state == Player.STATE_ENDED) handleEnded()
      emitState()
    }
    override fun onIsPlayingChanged(isPlaying: Boolean) {
      lastState["status"] = if (isPlaying) "playing" else "paused"
      emitState()
    }
    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
      send("onError", Arguments.createMap().apply { putString("message", error.message) })
    }
  }

  init { player.addListener(listener) }

  private fun send(name: String, params: WritableMap?) {
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, params)
  }
  private fun emitState() {
    send("onState", Arguments.createMap().apply { putString("stateJson", JSONObject(lastState as Map<*,*>).toString()) })
  }
  private fun emitQueue() {
    send("onQueueChange", Arguments.createMap().apply {
      putArray("tracks", Arguments.createArray().apply { tracks.forEach { pushString(it.id) } })
      putInt("index", currentIndex())
    })
  }

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  private fun currentIndex(): Int = if (order.isEmpty()) -1 else order[cursor]

  private fun rebuildOrder(preserve: Boolean) {
    val prevActive = if (preserve && order.isNotEmpty() && cursor in order.indices) order[cursor] else -1
    val n = tracks.size
    order = (0 until n).toMutableList()
    if (shuffle && n > 1) {
      order.shuffle()
      if (prevActive >= 0) {
        val pos = order.indexOf(prevActive)
        if (pos > 0) { val tmp = order[0]; order[0] = order[pos]; order[pos] = tmp }
        cursor = 0
      }
    }
    if (cursor >= order.size) cursor = 0
  }

  private fun decodeTracks(json: String): List<Track> {
    val arr = JSONArray(json); val out = mutableListOf<Track>()
    for (i in 0 until arr.length()) {
      val o = arr.getJSONObject(i)
      val src = o.getJSONObject("source")
      val headers = src.optJSONObject("headers")?.let { jo ->
        buildMap { jo.keys().forEach { k -> put(k, jo.getString(k)) } }
      } ?: emptyMap()
      val type = src.optString("type").takeIf { it.isNotEmpty() }
      val drm = src.optString("drmLicenseUri").takeIf { it.isNotEmpty() }
      val cacheable = if (src.has("cacheable")) src.optBoolean("cacheable", true) else true
      out += Track(o.getString("id"), src.getString("uri"), headers, o.optString("title").takeIf { it.isNotEmpty() }, o.optString("artist").takeIf { it.isNotEmpty() }, type, drm, cacheable)
    }
    return out
  }

  private fun loadCurrent(autoPlay: Boolean = false) {
    if (order.isEmpty()) return
    val idx = order[cursor]
    val t = tracks[idx]
    val item = MediaItem.Builder().setUri(t.uri).setMediaId(t.id).build()
    val source = ExoPlayerProvider.buildMediaSource(ctx, item, t.headers, t.type, t.cacheable, t.drmLicenseUri)
    player.setMediaSource(source); player.prepare()
    lastState["status"] = "loading"; emitState()
    send("onTrackChange", Arguments.createMap().apply { putInt("index", idx); putString("id", t.id) })
    if (autoPlay) player.play()
    ensureMediaSession()
  }

  private fun ensureMediaSession() {
    if (mediaSession == null) mediaSession = MediaSession.Builder(ctx, player).build()
  }

  @ReactMethod fun setQueue(tracksJson: String) {
    tracks = decodeTracks(tracksJson).toMutableList()
    rebuildOrder(false); cursor = 0; loadCurrent(); emitQueue()
  }
  @ReactMethod fun addTracks(tracksJson: String) { tracks.addAll(decodeTracks(tracksJson)); rebuildOrder(true); emitQueue() }
  @ReactMethod fun removeTrack(id: String) { tracks.removeAll { it.id == id }; rebuildOrder(true); emitQueue(); loadCurrent() }
  @ReactMethod fun skipTo(index: Int) {
    val pos = order.indexOf(index)
    cursor = if (pos >= 0) pos else index.coerceIn(0, maxOf(0, order.size - 1))
    loadCurrent()
  }
  @ReactMethod fun next() {
    if (order.isEmpty()) return
    if (cursor < order.size - 1) cursor++ else if (repeatMode == "queue") cursor = 0 else { send("onEnded", null); return }
    loadCurrent(true)
  }
  @ReactMethod fun previous() {
    if (order.isEmpty()) return
    cursor = if (cursor > 0) cursor - 1 else if (repeatMode == "queue") order.size - 1 else 0
    loadCurrent(true)
  }
  @ReactMethod fun play() { player.play() }
  @ReactMethod fun pause() { player.pause() }
  @ReactMethod fun stop() { player.pause(); player.seekTo(0) }
  @ReactMethod fun seek(seconds: Double) { player.seekTo((seconds * 1000).toLong()) }
  @ReactMethod fun setRate(rate: Double) {
    lastState["rate"] = rate
    player.setPlaybackParameters(androidx.media3.common.PlaybackParameters(rate.toFloat()))
  }
  @ReactMethod fun setVolume(volume: Double) { lastState["volume"] = volume; player.volume = volume.toFloat() }
  @ReactMethod fun setMuted(muted: Boolean) { lastState["muted"] = muted; player.volume = if (muted) 0f else (lastState["volume"] as Double).toFloat() }
  @ReactMethod fun setRepeatMode(mode: String) { repeatMode = mode }
  @ReactMethod fun setShuffle(s: Boolean) { shuffle = s; rebuildOrder(true) }
  @ReactMethod fun setRemoteControls(optionsJson: String) { ensureMediaSession() }
  @ReactMethod fun setBackgroundEnabled(enabled: Boolean) {
    if (enabled) {
      val intent = Intent(ctx, ObsidianPlaybackService::class.java)
      if (tracks.isNotEmpty()) {
        val t = tracks[currentIndex().coerceAtLeast(0).coerceAtMost(maxOf(0, tracks.size - 1))]
        intent.putExtra("title", t.title ?: t.id); intent.putExtra("artist", t.artist ?: "")
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
      ensureMediaSession()
    } else {
      ctx.stopService(Intent(ctx, ObsidianPlaybackService::class.java))
    }
  }
  @ReactMethod fun getCurrentState(p: Promise) { p.resolve(JSONObject(lastState as Map<*,*>).toString()) }
  @ReactMethod fun getCurrentQueue(p: Promise) {
    val o = JSONObject().apply { put("index", currentIndex()); put("ids", JSONArray(tracks.map { it.id })) }
    p.resolve(o.toString())
  }

  private fun handleEnded() {
    if (repeatMode == "track") { player.seekTo(0); player.play() } else next()
  }

  override fun invalidate() { mediaSession?.release(); player.release(); super.invalidate() }
}
