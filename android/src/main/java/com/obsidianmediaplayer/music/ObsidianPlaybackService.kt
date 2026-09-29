package com.obsidianmediaplayer.music

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.MediaStyleNotificationHelper

/**
 * FG-4.0 — the foreground service owns the music player.
 *
 * This used to be a bare `Service` holding no player, no session and no
 * queue: it built a static notification from intent extras and called
 * `startForeground`. The actual `ExoPlayer` belonged to the React module, so
 * a JS reload (`invalidate()`) stopped the audio, process death re-posted a
 * notification with no audio behind it, track changes never reached the
 * notification, and no external surface (lock screen, headset, Wear OS, Auto)
 * could connect (`onBind` returned null).
 *
 * Now this is a [MediaSessionService] owning the shared [ExoPlayer] (via
 * [MusicPlaybackHolder]) and the [MediaSession] built from it. The service is
 * the only process component guaranteed to outlive a JS reload, so the module
 * borrows the player and never releases it — audio survives Fast Refresh and
 * bridge teardown. External surfaces connect through the inherited
 * `MediaSessionService` binder for free.
 *
 * Transport that needs no queue (play / pause / seek / stop) is handled here
 * directly on the player. Queue hops (`next` / `previous`) dispatch back to
 * the module when it is alive ([MusicPlaybackHolder.onNext]/[onPrevious]);
 * every command is also forwarded to JS as `onRemoteCommand`, matching the
 * iOS shape (`{ command, position }`), so `useRemoteControls` works on
 * Android with zero JS changes (FG-4.1 step 2).
 */
class ObsidianPlaybackService : MediaSessionService() {

  companion object {
    const val CHANNEL_ID = "obsidian_playback"
    const val NOTIFICATION_ID = 1
    const val ACTION_UPDATE = "com.obsidianmediaplayer.UPDATE_NOTIFICATION"
    const val ACTION_TOGGLE = "com.obsidianmediaplayer.TOGGLE"
    const val ACTION_NEXT = "com.obsidianmediaplayer.NEXT"
    const val ACTION_PREV = "com.obsidianmediaplayer.PREV"
  }

  private var session: MediaSession? = null

  // FG-4.1 step 1: media3 1.3.1 routes controller transport through
  // onPlayerCommandRequest (there are no per-action onPlay/onPause/... hooks
  // on MediaSession.Callback in this version), so this is where lock-screen,
  // headset, Wear OS and Auto commands are observed and gated. Queue hops go
  // through the same holder dispatch JS calls, so in-app and external control
  // can never diverge; every command is also forwarded to JS as
  // onRemoteCommand in the { command, payload } shape useRemoteControls
  // expects (step 2). Disabled options (step 5) deny the command outright.
  private val sessionCallback = object : MediaSession.Callback {
    override fun onPlayerCommandRequest(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      playerCommand: Int,
    ): Int {
      when (playerCommand) {
        Player.COMMAND_PLAY_PAUSE -> {
          if (!MusicPlaybackHolder.enablePlayPause) return Player.COMMAND_INVALID
          val playing = MusicPlaybackHolder.peek()?.isPlaying == true
          MusicPlaybackHolder.onRemoteCommand?.invoke(if (playing) "pause" else "play", null)
        }
        Player.COMMAND_STOP -> {
          if (!MusicPlaybackHolder.enablePlayPause) return Player.COMMAND_INVALID
          MusicPlaybackHolder.onRemoteCommand?.invoke("stop", null)
        }
        Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
        Player.COMMAND_SEEK_IN_CURRENT_WINDOW,
        Player.COMMAND_SEEK_BACK,
        Player.COMMAND_SEEK_FORWARD,
        Player.COMMAND_SEEK_TO_DEFAULT_POSITION,
        -> {
          if (!MusicPlaybackHolder.enableSeek) return Player.COMMAND_INVALID
          val pos = try { (MusicPlaybackHolder.peek()?.currentPosition ?: 0L) / 1000.0 } catch (_: Exception) { 0.0 }
          MusicPlaybackHolder.onRemoteCommand?.invoke("seek", pos)
        }
        Player.COMMAND_SEEK_TO_NEXT,
        Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
        Player.COMMAND_SEEK_TO_NEXT_WINDOW,
        -> {
          if (!MusicPlaybackHolder.enableSkip) return Player.COMMAND_INVALID
          // Same code path JS calls — the single-item player has no playlist
          // for the session to advance on its own.
          MusicPlaybackHolder.onNext?.invoke()
          MusicPlaybackHolder.onRemoteCommand?.invoke("next", null)
        }
        Player.COMMAND_SEEK_TO_PREVIOUS,
        Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
        Player.COMMAND_SEEK_TO_PREVIOUS_WINDOW,
        -> {
          if (!MusicPlaybackHolder.enableSkip) return Player.COMMAND_INVALID
          MusicPlaybackHolder.onPrevious?.invoke()
          MusicPlaybackHolder.onRemoteCommand?.invoke("previous", null)
        }
      }
      refreshNotification()
      return playerCommand
    }

    override fun onMediaButtonEvent(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      intent: Intent,
    ): Boolean {
      // Headset / media-button intents: let the session apply them to the
      // player (return false), but keep the notification in sync.
      refreshNotification()
      return false
    }
  }

  private val playerListener = object : Player.Listener {
    override fun onIsPlayingChanged(isPlaying: Boolean) = refreshNotification()
    override fun onPlaybackStateChanged(state: Int) {
      if (state == Player.STATE_ENDED || state == Player.STATE_READY) refreshNotification()
    }
  }

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW)
      (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
    }
    val player = MusicPlaybackHolder.getOrCreate(this)
    player.addListener(playerListener)
    if (session == null) {
      session = MediaSession.Builder(this, player).setCallback(sessionCallback).build()
    }
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    when (intent?.action) {
      ACTION_TOGGLE -> {
        val p = MusicPlaybackHolder.peek()
        if (p?.isPlaying == true) p.pause() else p?.play()
        refreshNotification()
      }
      ACTION_NEXT -> {
        MusicPlaybackHolder.onNext?.invoke()
        MusicPlaybackHolder.onRemoteCommand?.invoke("next", null)
        refreshNotification()
      }
      ACTION_PREV -> {
        MusicPlaybackHolder.onPrevious?.invoke()
        MusicPlaybackHolder.onRemoteCommand?.invoke("previous", null)
        refreshNotification()
      }
      else -> {
        // Plain start (module setBackgroundEnabled(true)) or metadata update:
        // fall through to (re)posting the notification from holder state.
        refreshNotification()
      }
    }
    // Keep the previous restart contract: a killed service is recreated, and
    // onCreate rebuilds the player + session rather than re-posting a dead
    // notification with no audio behind it.
    return START_STICKY
  }

  /** Rebuild the MediaStyle notification from holder state (FG-4.1 step 3+6). */
  private fun refreshNotification() {
    val player = MusicPlaybackHolder.peek()
    val isPlaying = player?.isPlaying == true
    val toggleIntent = PendingIntent.getService(
      this, 1, Intent(this, ObsidianPlaybackService::class.java).setAction(ACTION_TOGGLE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(MusicPlaybackHolder.title)
      .setContentText(MusicPlaybackHolder.artist)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setOngoing(isPlaying)
      .setOnlyAlertOnce(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setStyle(MediaStyleNotificationHelper.MediaStyle(session!!))
    if (MusicPlaybackHolder.enableSkip) {
      builder.addAction(
        android.R.drawable.ic_media_previous, "Previous",
        PendingIntent.getService(
          this, 2, Intent(this, ObsidianPlaybackService::class.java).setAction(ACTION_PREV),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
    }
    if (MusicPlaybackHolder.enablePlayPause) {
      builder.addAction(
        if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        if (isPlaying) "Pause" else "Play",
        toggleIntent,
      )
    }
    if (MusicPlaybackHolder.enableSkip) {
      builder.addAction(
        android.R.drawable.ic_media_next, "Next",
        PendingIntent.getService(
          this, 3, Intent(this, ObsidianPlaybackService::class.java).setAction(ACTION_NEXT),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
    }
    val notification = builder.build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID, notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    // FG-6.4: artwork arrives asynchronously and must not block the posting.
    // Rebuild once with the large icon when the fetch lands.
    loadArtworkAsync(builder)
  }

  private fun loadArtworkAsync(base: NotificationCompat.Builder) {
    val url = MusicPlaybackHolder.artworkUrl ?: return
    Thread {
      try {
        BitmapFactory.decodeStream(java.net.URL(url).openStream())?.let { bitmap ->
          val rebuilt = base.setLargeIcon(bitmap).build()
          val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
          nm.notify(NOTIFICATION_ID, rebuilt)
        }
      } catch (_: Exception) {
        // No artwork, no icon — the notification stays correct without it.
      }
    }.start()
  }

  override fun onDestroy() {
    // The session belongs to the service; the player is shared with the
    // module, so it is NOT released here either — the process going away
    // reclaims it. Releasing the player while the module still references it
    // would crash the next play() after a service restart within one process.
    MusicPlaybackHolder.peek()?.removeListener(playerListener)
    session?.release()
    session = null
    super.onDestroy()
  }
}
