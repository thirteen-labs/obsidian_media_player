package com.obsidianmediaplayer.video

import android.content.Context
import android.view.TextureView
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.obsidianmediaplayer.core.ExoPlayerProvider
import org.json.JSONObject

/**
 * TextureView-backed video surface driven by a dedicated ExoPlayer.
 * Shares the disk cache with the audio/music players.
 */
class ObsidianVideoView(context: Context) : FrameLayout(context) {
  private val textureView = TextureView(context)
  private val player: ExoPlayer = ExoPlayerProvider.buildPlayer(context)

  var onStateChange: ((String) -> Unit)? = null
  var onProgress: ((Double, Double) -> Unit)? = null
  var onEnded: (() -> Unit)? = null
  var onError: ((String) -> Unit)? = null

  private var lastState = mutableMapOf<String, Any>(
    "status" to "idle", "position" to 0.0, "duration" to 0.0,
    "rate" to 1.0, "muted" to false, "volume" to 1.0,
    "buffered" to 0.0, "inBackground" to false
  )

  init {
    addView(textureView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    player.addListener(object : Player.Listener {
      override fun onPlaybackStateChanged(state: Int) {
        lastState["status"] = when (state) {
          Player.STATE_READY -> if (player.playWhenReady) "playing" else "ready"
          Player.STATE_BUFFERING -> "buffering"
          Player.STATE_ENDED -> "ended"
          else -> "loading"
        }
        if (state == Player.STATE_ENDED) onEnded?.invoke()
        emitState()
      }
      override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
        lastState["status"] = "error"
        lastState["error"] = error.message ?: "unknown"
        onError?.invoke(error.message ?: "unknown")
        emitState()
      }
      override fun onIsPlayingChanged(isPlaying: Boolean) {
        lastState["status"] = if (isPlaying) "playing" else "paused"
        emitState()
      }
    })
    // Poll progress ~4 Hz on the UI thread
    post(progressRunnable)
  }

  private val progressRunnable = object : Runnable {
    override fun run() {
      val pos = player.currentPosition / 1000.0
      val dur = if (player.duration > 0) player.duration / 1000.0 else 0.0
      lastState["position"] = pos
      lastState["duration"] = dur
      lastState["buffered"] = player.bufferedPosition / 1000.0
      if (player.isPlaying) onProgress?.invoke(pos, dur)
      postDelayed(this, 250)
    }
  }

  fun load(sourceJson: String) {
    val obj = JSONObject(sourceJson)
    val uri = obj.getString("uri")
    val headers = obj.optJSONObject("headers")?.let { jo ->
      buildMap { jo.keys().forEach { k -> put(k, jo.getString(k)) } }
    } ?: emptyMap()
    val type = obj.optString("type", null)?.takeIf { it.isNotEmpty() }
    val cacheable = obj.optBoolean("cacheable", true)
    val drmLicenseUri = obj.optString("drmLicenseUri", null)?.takeIf { it.isNotEmpty() }
    val mediaItem = MediaItem.Builder().setUri(uri).build()
    val source = ExoPlayerProvider.buildMediaSource(context, mediaItem, headers, type, cacheable, drmLicenseUri)
    player.setMediaSource(source)
    player.prepare()
    lastState["status"] = "loading"
    emitState()
  }

  fun setPaused(paused: Boolean) { player.playWhenReady = !paused }
  fun setMuted(muted: Boolean) { player.volume = if (muted) 0f else (lastState["volume"] as Double).toFloat(); lastState["muted"] = muted }
  fun setVolume(volume: Double) { lastState["volume"] = volume; if (lastState["muted"] != true) player.volume = volume.toFloat() }
  fun setRate(rate: Double) {
    lastState["rate"] = rate
    player.setPlaybackParameters(androidx.media3.common.PlaybackParameters(rate.toFloat()))
  }
  fun setResizeMode(mode: String) { /* TextureView scale: contain/cover handled by matrix */ }
  fun setRepeat(repeat: Boolean) { player.repeatMode = if (repeat) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF }

  // Commands
  fun commandPlay() { player.play() }
  fun commandPause() { player.pause() }
  fun commandStop() { player.pause(); player.seekTo(0) }
  fun commandSeek(s: Double) { player.seekTo((s * 1000).toLong()) }
  fun commandSetRate(r: Double) = setRate(r)
  fun commandSetVolume(v: Double) = setVolume(v)
  fun commandSetMuted(m: Boolean) = setMuted(m)
  fun commandSetResizeMode(m: String) = setResizeMode(m)

  private fun emitState() {
    val json = JSONObject(lastState as Map<*, *>).toString()
    onStateChange?.invoke(json)
  }

  fun release() {
    removeCallbacks(progressRunnable)
    player.release()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    player.setVideoTextureView(textureView)
  }

  override fun onDetachedFromWindow() {
    player.clearVideoTextureView(textureView)
    super.onDetachedFromWindow()
  }
}
