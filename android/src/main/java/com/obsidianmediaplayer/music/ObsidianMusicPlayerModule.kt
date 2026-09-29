package com.obsidianmediaplayer.music

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.obsidianmediaplayer.core.ExoPlayerProvider
import org.json.JSONArray
import org.json.JSONObject

/**
 * Full-featured music player with queue, shuffle/repeat, background audio
 * (foreground Service + MediaSession) and lock-screen remote controls.
 * Registered as "ObsidianMusicPlayer".
 *
 * Ownership (FG-4.0): the [ExoPlayer] and the [MediaSession] belong to
 * [ObsidianPlaybackService] via [MusicPlaybackHolder]. This module borrows the
 * shared player and only detaches its listener in [invalidate] — it never
 * releases the player — so audio survives a JS reload / Fast Refresh. Queue
 * state stays here; transport needing no queue is handled by the service
 * directly, queue hops dispatch back through the holder hooks below.
 */
class ObsidianMusicPlayerModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = NAME

  companion object {
    const val NAME = "ObsidianMusicPlayer"
    private const val PROGRESS_MS = 250L
  }

  // Shared with the service — never released here. invalidate() only detaches.
  private val player: ExoPlayer get() = MusicPlaybackHolder.getOrCreate(ctx)

  private data class Track(
    val id: String,
    val uri: String,
    val headers: Map<String, String>,
    val title: String?,
    val artist: String?,
    val album: String?,
    val artwork: String?,
    val duration: Double?,
    val type: String?,
    val cacheable: Boolean
  )

  private var tracks: MutableList<Track> = mutableListOf()
  private var order: MutableList<Int> = mutableListOf()
  private var cursor = 0
  private var repeatMode = "off"
  private var shuffle = false
  private var backgroundEnabled = false
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
      refreshNotification()
    }
    override fun onIsPlayingChanged(isPlaying: Boolean) {
      lastState["status"] = if (isPlaying) "playing" else "paused"
      emitState()
      refreshNotification()
    }
    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
      send("onError", Arguments.createMap().apply { putString("message", error.message) })
    }
  }

  // FG-4.2: periodic progress, mirroring ObsidianVideoView's runnable and
  // iOS's 0.25 s time observer. Updates the cached position/duration/buffered
  // and emits ONLY onProgress — never a full onState per tick (a JSON
  // serialise plus a bridge crossing 4x/second). Started in loadCurrent(),
  // always removed in invalidate() so a leaked runnable cannot keep the
  // module alive.
  private val progressHandler = Handler(Looper.getMainLooper())
  private val progressRunnable = object : Runnable {
    override fun run() {
      try {
        val p = MusicPlaybackHolder.peek()
        if (p != null) {
          val pos = p.currentPosition / 1000.0
          val dur = if (p.duration > 0) p.duration / 1000.0 else 0.0
          lastState["position"] = pos
          lastState["duration"] = dur
          lastState["buffered"] = p.bufferedPosition / 1000.0
          if (p.isPlaying) {
            send("onProgress", Arguments.createMap().apply {
              putDouble("position", pos); putDouble("duration", dur)
            })
          }
        }
      } catch (_: Exception) { /* player gone mid-tick — next tick recovers */ }
      progressHandler.postDelayed(this, PROGRESS_MS)
    }
  }

  init {
    player.addListener(listener)
    progressHandler.post(progressRunnable)
    // Service dispatches queue hops back here; remote commands go to JS in
    // the { command, payload } shape useRemoteControls expects (FG-4.1).
    MusicPlaybackHolder.onNext = { next() }
    MusicPlaybackHolder.onPrevious = { previous() }
    MusicPlaybackHolder.onRemoteCommand = { command, position ->
      val payload = Arguments.createMap()
      if (position != null) payload.putDouble("position", position)
      send("onRemoteCommand", Arguments.createMap().apply {
        putString("command", command); putMap("payload", payload)
      })
    }
  }

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

  /** Re-post the service notification from holder state — only while backgrounded. */
  private fun refreshNotification() {
    if (!backgroundEnabled) return
    try {
      val intent = Intent(ctx, ObsidianPlaybackService::class.java)
        .setAction(ObsidianPlaybackService.ACTION_UPDATE)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent)
      else ctx.startService(intent)
    } catch (_: Exception) { /* service unavailable — playback continues foreground */ }
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
      val cacheable = if (src.has("cacheable")) src.optBoolean("cacheable", true) else true
      out += Track(
        o.getString("id"), src.getString("uri"), headers,
        o.optString("title").takeIf { it.isNotEmpty() },
        o.optString("artist").takeIf { it.isNotEmpty() },
        o.optString("album").takeIf { it.isNotEmpty() },
        // FG-6.4: artwork / duration were decoded on iOS and dropped here.
        o.optString("artwork").takeIf { it.isNotEmpty() },
        o.optDouble("duration").takeIf { !o.isNull("duration") },
        type, cacheable,
      )
    }
    return out
  }

  private fun loadCurrent(autoPlay: Boolean = false) {
    if (order.isEmpty()) return
    val idx = order[cursor]
    val t = tracks[idx]
    // FG-6.4: publish title/artist/album/artwork/duration on the MediaItem so
    // the session, Auto and the notification can render them.
    val metadata = MediaMetadata.Builder()
      .setTitle(t.title ?: t.id)
      .setArtist(t.artist)
      .setAlbumTitle(t.album)
      .setArtworkUri(t.artwork?.let { try { android.net.Uri.parse(it) } catch (_: Exception) { null } })
      .build()
    val item = MediaItem.Builder().setUri(t.uri).setMediaId(t.id).setMediaMetadata(metadata).build()
    val source = ExoPlayerProvider.buildMediaSource(ctx, item, t.headers, t.type, t.cacheable)
    player.setMediaSource(source); player.prepare()
    lastState["status"] = "loading"; emitState()
    send("onTrackChange", Arguments.createMap().apply { putInt("index", idx); putString("id", t.id) })
    if (autoPlay) player.play()
    // FG-4.1 step 6: the notification follows track changes, not the
    // one-shot intent extras it used to be built from.
    MusicPlaybackHolder.setNowPlaying(t.title ?: t.id, t.artist ?: "", t.artwork, t.id)
    refreshNotification()
  }

  @ReactMethod fun setQueue(tracksJson: String) {
    tracks = decodeTracks(tracksJson).toMutableList()
    rebuildOrder(false); cursor = 0; loadCurrent(); emitQueue()
  }
  @ReactMethod fun addTracks(tracksJson: String) { tracks.addAll(decodeTracks(tracksJson)); rebuildOrder(true); emitQueue() }
  @ReactMethod fun removeTrack(id: String) {
    // FG-4.4: removing an unplayed track must not restart the current song.
    // Mirror of useMusicPlayer.web removeTrack — surgical order update, reload
    // only when the loaded track was removed, empty queue stops cleanly.
    val trackPos = tracks.indexOfFirst { it.id == id }
    if (trackPos < 0) return
    val wasActive = currentIndex() == trackPos
    val wasPlaying = try { player.isPlaying } catch (_: Exception) { false }
    val removedAtCursor = order.indexOf(trackPos)
    tracks.removeAt(trackPos)
    if (tracks.isEmpty()) {
      order = mutableListOf(); cursor = 0
      try { player.stop(); player.clearMediaItems() } catch (_: Exception) {}
      lastState["status"] = "idle"; lastState["position"] = 0.0
      emitState(); emitQueue(); refreshNotification()
      return
    }
    order = order.filter { it != trackPos }.map { if (it > trackPos) it - 1 else it }.toMutableList()
    cursor = when {
      wasActive -> removedAtCursor.coerceIn(0, order.size - 1)
      removedAtCursor >= 0 && removedAtCursor < cursor -> cursor - 1
      else -> cursor.coerceIn(0, order.size - 1)
    }
    emitQueue()
    if (wasActive) loadCurrent(wasPlaying)
  }
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
  @ReactMethod fun seek(seconds: Double) {
    player.seekTo((seconds * 1000).toLong())
    lastState["position"] = seconds
    send("onProgress", Arguments.createMap().apply {
      putDouble("position", seconds)
      putDouble("duration", lastState["duration"] as? Double ?: 0.0)
    })
  }
  @ReactMethod fun setRate(rate: Double) {
    lastState["rate"] = rate
    player.setPlaybackParameters(androidx.media3.common.PlaybackParameters(rate.toFloat()))
  }
  @ReactMethod fun setVolume(volume: Double) { lastState["volume"] = volume; player.volume = volume.toFloat() }
  @ReactMethod fun setMuted(muted: Boolean) { lastState["muted"] = muted; player.volume = if (muted) 0f else (lastState["volume"] as Double).toFloat() }
  @ReactMethod fun setRepeatMode(mode: String) { repeatMode = mode }
  @ReactMethod fun setShuffle(s: Boolean) { shuffle = s; rebuildOrder(true) }
  @ReactMethod fun setRemoteControls(optionsJson: String) {
    // FG-4.1 step 5: the argument used to be discarded
    // (= ensureMediaSession()). Parse it honestly, mirroring iOS
    // ObsidianRemoteControls.setEnabled — unknown/absent keys default on.
    try {
      val o = JSONObject(optionsJson)
      MusicPlaybackHolder.setRemoteOptions(
        if (o.has("enablePlayPause")) o.optBoolean("enablePlayPause", true) else true,
        if (o.has("enableSkip")) o.optBoolean("enableSkip", true) else true,
        if (o.has("enableSeek")) o.optBoolean("enableSeek", true) else true,
      )
    } catch (_: Exception) { /* keep previous options */ }
    refreshNotification()
  }
  @ReactMethod fun setBackgroundEnabled(enabled: Boolean) {
    backgroundEnabled = enabled
    lastState["inBackground"] = enabled
    if (enabled) {
      if (tracks.isNotEmpty() && order.isNotEmpty()) {
        val t = tracks[currentIndex().coerceIn(0, tracks.size - 1)]
        MusicPlaybackHolder.setNowPlaying(t.title ?: t.id, t.artist ?: "", t.artwork, t.id)
      }
      val intent = Intent(ctx, ObsidianPlaybackService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
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

  override fun invalidate() {
    // Service-owned player: detach only. Releasing here is what made every
    // Fast Refresh / code push kill the audio (FG-4.0).
    progressHandler.removeCallbacks(progressRunnable)
    try { MusicPlaybackHolder.peek()?.removeListener(listener) } catch (_: Exception) {}
    if (MusicPlaybackHolder.onNext != null) {
      // Only clear hooks owned by this instance's init — a re-created module
      // re-registers immediately after.
      MusicPlaybackHolder.onNext = null
      MusicPlaybackHolder.onPrevious = null
      MusicPlaybackHolder.onRemoteCommand = null
    }
    super.invalidate()
  }
}
