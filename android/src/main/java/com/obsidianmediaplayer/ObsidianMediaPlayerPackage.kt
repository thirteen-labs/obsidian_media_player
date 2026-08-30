package com.obsidianmediaplayer

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.obsidianmediaplayer.audio.ObsidianAudioModule
import com.obsidianmediaplayer.cache.ObsidianCacheModule
import com.obsidianmediaplayer.music.ObsidianMusicPlayerModule
import com.obsidianmediaplayer.video.ObsidianVideoManager

class ObsidianMediaPlayerPackage : ReactPackage {
  override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
    listOf(ObsidianAudioModule(ctx), ObsidianMusicPlayerModule(ctx), ObsidianCacheModule(ctx))

  override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(ObsidianVideoManager())
}
