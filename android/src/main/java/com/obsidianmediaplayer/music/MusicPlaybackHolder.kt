package com.obsidianmediaplayer.music

import android.content.Context
import androidx.media3.exoplayer.ExoPlayer
import com.obsidianmediaplayer.core.ExoPlayerProvider

/**
 * FG-4.0 — single owner for the music [ExoPlayer].
 *
 * Before this, the React module built the player in a `by lazy` block and the
 * foreground service held nothing, so a JS reload (`invalidate()`) stopped the
 * audio, process death re-posted a notification with no player behind it, and
 * no external surface (lock screen, headset, Auto) could reach the session.
 *
 * Now both the service and the module resolve the player here. The service
 * creates it in `onCreate` (so it exists before any JS runs) and owns the
 * `MediaSession` built from it; the module borrows the same instance and —
 * critically — no longer releases it in `invalidate()`, only detaches its
 * listener. Audio therefore survives Fast Refresh / bridge teardown.
 *
 * The queue still lives in the module (moving it into the service is a larger
 * migration and would change the public surface). Transport that needs no
 * queue (play / pause / seek / stop) is handled by the service directly on
 * the player; `next` / `previous` are dispatched back to the module when it is
 * alive via [onNext]/[onPrevious], and remote-command events reach JS through
 * [onRemoteCommand]. When the module is absent (e.g. during a reload) those
 * hooks are null and the service degrades to transport-only rather than
 * crashing — the session and the audio outlive the bridge by design.
 */
object MusicPlaybackHolder {
  @Volatile private var player: ExoPlayer? = null

  /** Now-playing metadata published by the module on every loadCurrent(). */
  @Volatile var title: String = "Playing"
  @Volatile var artist: String = "Obsidian Media Player"
  @Volatile var artworkUrl: String? = null
  @Volatile var trackId: String? = null

  /** Honest copy of the last setRemoteControls() options (FG-4.1 step 5). */
  @Volatile var enablePlayPause: Boolean = true
  @Volatile var enableSkip: Boolean = true
  @Volatile var enableSeek: Boolean = true

  /** Emitted for every lock-screen / headset / Auto command. */
  var onRemoteCommand: ((command: String, positionSeconds: Double?) -> Unit)? = null

  /** Queue hops — registered by the module, invoked by the service session. */
  var onNext: (() -> Unit)? = null
  var onPrevious: (() -> Unit)? = null

  @Synchronized
  fun getOrCreate(context: Context): ExoPlayer {
    return player ?: ExoPlayerProvider.buildPlayer(context.applicationContext).also { player = it }
  }

  fun peek(): ExoPlayer? = player

  fun setNowPlaying(title: String?, artist: String?, artworkUrl: String?, trackId: String?) {
    if (title != null) this.title = title
    if (artist != null) this.artist = artist
    this.artworkUrl = artworkUrl
    this.trackId = trackId
  }

  fun setRemoteOptions(playPause: Boolean, skip: Boolean, seek: Boolean) {
    enablePlayPause = playPause
    enableSkip = skip
    enableSeek = seek
  }
}
