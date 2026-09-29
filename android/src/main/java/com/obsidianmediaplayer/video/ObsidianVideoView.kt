package com.obsidianmediaplayer.video

import android.content.Context
import android.graphics.Matrix
import android.view.TextureView
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
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
  var onBuffering: ((Double) -> Unit)? = null

  // Edge-triggered: `onBuffering` fires only on entry to / exit from
  // STATE_BUFFERING, not on every state change that happens to be a buffer.
  // Without this, a stalling stream re-fires on each transition and the host
  // app re-renders continuously.
  private var wasBuffering = false

  private var lastState = mutableMapOf<String, Any>(
    "status" to "idle", "position" to 0.0, "duration" to 0.0,
    "rate" to 1.0, "muted" to false, "volume" to 1.0,
    "buffered" to 0.0, "inBackground" to false
  )

  // Intrinsic video dimensions, reported by ExoPlayer once the first frame is
  // decoded. Both are 0 before that and after an error, so every consumer must
  // bail out rather than divide.
  private var videoWidth = 0
  private var videoHeight = 0
  private var resizeMode = "contain"

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
        val buffering = state == Player.STATE_BUFFERING
        if (buffering != wasBuffering) {
          wasBuffering = buffering
          onBuffering?.invoke(lastState["buffered"] as? Double ?: 0.0)
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
      // Fires when the stream's resolution changes too, not just on first
      // frame — a live HLS ladder switch re-lays out here.
      override fun onVideoSizeChanged(videoSize: VideoSize) {
        videoWidth = videoSize.width
        videoHeight = videoSize.height
        applyResizeMode()
      }
    })
    // Poll progress ~4 Hz on the UI thread
    post(progressRunnable)
  }

  fun load(sourceJson: String) {
    val obj = JSONObject(sourceJson)
    val uri = obj.getString("uri")
    val headers = obj.optJSONObject("headers")?.let { jo ->
      buildMap { jo.keys().forEach { k -> put(k, jo.getString(k)) } }
    } ?: emptyMap()
    val type = obj.optString("type").takeIf { it.isNotEmpty() }
    val cacheable = obj.optBoolean("cacheable", true)
    val mediaItem = MediaItem.Builder().setUri(uri).build()
    val source = ExoPlayerProvider.buildMediaSource(context, mediaItem, headers, type, cacheable)
    // A new source may have different dimensions; drop the stale ones so
    // applyResizeMode() cannot scale against the previous video until
    // onVideoSizeChanged fires for the new one.
    videoWidth = 0
    videoHeight = 0
    textureView.setTransform(Matrix())
    // Re-arm the buffering edge so the first stall of a new source is reported.
    wasBuffering = false
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
  /**
   * Scale the TextureView to honour `resizeMode`.
   *
   * A TextureView always renders its buffer stretched to the view bounds, so
   * every mode except `stretch` is expressed as a uniform scale about the
   * view centre. `cover` deliberately overflows and clips.
   *
   * Mirrors ObsidianVideoPlayer.applyResizeMode() on iOS, with the caveat that
   * iOS maps `none` to AVPlayerLayer.videoGravity = .resize because
   * AVPlayerLayer has no true "no scaling" mode.
   */
  fun setResizeMode(mode: String) {
    resizeMode = mode
    applyResizeMode()
  }

  private fun applyResizeMode() {
    val viewW = width
    val viewH = height
    if (viewW == 0 || viewH == 0 || videoWidth == 0 || videoHeight == 0) return

    val m = Matrix()
    val cx = viewW / 2f
    val cy = viewH / 2f
    when (resizeMode) {
      "cover" -> {
        val s = maxOf(viewW.toFloat() / videoWidth, viewH.toFloat() / videoHeight)
        m.setScale(s, s, cx, cy)
      }
      "stretch" -> {
        m.setScale(viewW.toFloat() / videoWidth, viewH.toFloat() / videoHeight, cx, cy)
      }
      "none" -> m.setScale(1f, 1f, cx, cy)
      else -> { // "contain" and any unknown value
        val s = minOf(viewW.toFloat() / videoWidth, viewH.toFloat() / videoHeight)
        m.setScale(s, s, cx, cy)
      }
    }
    textureView.setTransform(m)
  }

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
    applyResizeMode()
  }

  override fun onDetachedFromWindow() {
    player.clearVideoTextureView(textureView)
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    // Rotation, split-screen, or a parent re-layout.
    applyResizeMode()
  }
}
