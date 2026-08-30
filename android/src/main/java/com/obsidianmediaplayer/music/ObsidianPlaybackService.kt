package com.obsidianmediaplayer.music

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class ObsidianPlaybackService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel("obsidian_playback", "Playback", NotificationManager.IMPORTANCE_LOW)
      (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val n: Notification = NotificationCompat.Builder(this, "obsidian_playback")
      .setContentTitle(intent?.getStringExtra("title") ?: "Playing")
      .setContentText(intent?.getStringExtra("artist") ?: "Obsidian Media Player")
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setOngoing(true)
      .build()
    startForeground(1, n)
    return START_STICKY
  }
}
