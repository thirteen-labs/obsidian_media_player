package com.obsidianmediaplayer

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.obsidianmediaplayer.audio.ObsidianAudioModule
import com.obsidianmediaplayer.cache.ObsidianCacheModule
import com.obsidianmediaplayer.music.ObsidianMusicPlayerModule
import com.obsidianmediaplayer.video.ObsidianVideoManager

/**
 * Package for obsidian-media-player.
 *
 * Extends [BaseReactPackage] (instead of the legacy [com.facebook.react.ReactPackage])
 * so the Audio / Music / Cache modules resolve as TurboModules under the New
 * Architecture (via [getReactModuleInfoProvider]) while continuing to work on
 * the legacy bridge / Old Architecture. The <ObsidianVideo> view is exposed
 * through [createViewManagers] and renders via Paper, with Fabric interop
 * handling it automatically until the generated ViewManagerDelegate is wired
 * in (see android/CMakeLists.txt + src/main/jni/OnLoad.cpp).
 */
class ObsidianMediaPlayerPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    when (name) {
      ObsidianAudioModule.NAME -> ObsidianAudioModule(reactContext)
      ObsidianMusicPlayerModule.NAME -> ObsidianMusicPlayerModule(reactContext)
      ObsidianCacheModule.NAME -> ObsidianCacheModule(reactContext)
      else -> null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        ObsidianAudioModule.NAME to ReactModuleInfo(
          ObsidianAudioModule.NAME,
          ObsidianAudioModule::class.java.name,
          false, // canOverrideExistingModule
          false, // needsEagerInit
          false, // hasConstants
          false, // isCxxModule
          true, // isTurboModule
        ),
        ObsidianMusicPlayerModule.NAME to ReactModuleInfo(
          ObsidianMusicPlayerModule.NAME,
          ObsidianMusicPlayerModule::class.java.name,
          false,
          false,
          false,
          false,
          true,
        ),
        ObsidianCacheModule.NAME to ReactModuleInfo(
          ObsidianCacheModule.NAME,
          ObsidianCacheModule::class.java.name,
          false,
          false,
          false,
          false,
          true,
        ),
      )
    }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(ObsidianVideoManager())
}
