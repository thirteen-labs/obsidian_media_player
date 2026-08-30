package com.obsidianmediaplayer.audio

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.obsidianmediaplayer.core.ExoPlayerProvider
import org.json.JSONObject

/**
 * Headless Audio player. Registered as "ObsidianAudio" for both the legacy
 * bridge (NativeModules.ObsidianAudio) and the New Architecture TurboModule.
 * Internally uses a single ExoPlayer with a disk cache.
 */
class ObsidianAudioModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "ObsidianAudio"

  private val player: ExoPlayer by lazy { ExoPlayerProvider.buildPlayer(ctx) }
  private var loop = false
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
        Player.STATE_ENDED -> { if (loop) { player.seekTo(0); player.play(); "playing" } else "ended" }
        else -> "loading"
      }
      if (state == Player.STATE_ENDED && !loop) send("onEnded", Arguments.createMap())
      emitState()
    }
    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
      lastState["status"] = "error"; lastState["error"] = error.message ?: "unknown"
      send("onError", Arguments.createMap().apply { putString("message", error.message) })
      emitState()
    }
    override fun onIsPlayingChanged(isPlaying: Boolean) {
      lastState["status"] = if (isPlaying) "playing" else "paused"
      emitState()
    }
  }

  init { player.addListener(listener) }

  private fun send(name: String, params: WritableMap?) {
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, params)
  }
  private fun emitState() {
    send("onState", Arguments.createMap().apply { putString("stateJson", JSONObject(lastState as Map<*, *>).toString()) })
  }

  // Listener book-keeping expected by NativeEventEmitter / TurboModule
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  @ReactMethod fun load(sourceJson: String) {
    val obj = JSONObject(sourceJson)
    val uri = obj.getString("uri")
    val headers = obj.optJSONObject("headers")?.let { jo ->
      buildMap { jo.keys().forEach { k -> put(k, jo.getString(k)) } }
    } ?: emptyMap()
    val type = obj.optString("type", null)?.takeIf { it.isNotEmpty() }
    val cacheable = obj.optBoolean("cacheable", true)
    val drmLicenseUri = obj.optString("drmLicenseUri", null)?.takeIf { it.isNotEmpty() }
    val item = MediaItem.Builder().setUri(uri).build()
    val source = ExoPlayerProvider.buildMediaSource(ctx, item, headers, type, cacheable, drmLicenseUri)
    player.setMediaSource(source); player.prepare()
    lastState["status"] = "loading"; emitState()
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
  @ReactMethod fun setLoop(loop: Boolean) { this.loop = loop; player.repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF }

  @ReactMethod fun getCurrentState(p: Promise) { p.resolve(JSONObject(lastState as Map<*, *>).toString()) }

  override fun invalidate() { player.release(); super.invalidate() }
}
