package com.obsidianmediaplayer.video

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * Paper (and via interop, Fabric) ViewManager for <ObsidianVideo>.
 * Props arrive as sourceJson / paused / muted / volume / rate / resizeMode /
 * repeat. Commands are dispatched from the JS `Commands.*` helpers.
 */
class ObsidianVideoManager : SimpleViewManager<ObsidianVideoView>() {
  override fun getName() = "ObsidianVideo"

  override fun createViewInstance(reactContext: ThemedReactContext) =
    ObsidianVideoView(reactContext).also { view ->
      view.onStateChange = { json ->
        reactContext.getJSModule(com.facebook.react.uimanager.events.RCTEventEmitter::class.java)
          .receiveEvent(view.id, "onStateChange", com.facebook.react.bridge.Arguments.createMap().apply {
            putString("stateJson", json)
          })
      }
      view.onProgress = { pos, dur ->
        reactContext.getJSModule(com.facebook.react.uimanager.events.RCTEventEmitter::class.java)
          .receiveEvent(view.id, "onProgress", com.facebook.react.bridge.Arguments.createMap().apply {
            putDouble("position", pos); putDouble("duration", dur)
          })
      }
      view.onEnded = {
        reactContext.getJSModule(com.facebook.react.uimanager.events.RCTEventEmitter::class.java)
          .receiveEvent(view.id, "onEnded", null)
      }
      // Fires once on entry to STATE_BUFFERING and once on exit. The
      // registration below ("onBuffering") has existed since 0.1.x but nothing
      // ever invoked it, so the prop was dead on Android. See to-be-done.md
      // FG-0.4c.
      view.onBuffering = { buffered ->
        reactContext.getJSModule(com.facebook.react.uimanager.events.RCTEventEmitter::class.java)
          .receiveEvent(view.id, "onBuffering", com.facebook.react.bridge.Arguments.createMap().apply {
            putDouble("buffered", buffered)
          })
      }
      view.onError = { msg ->
        reactContext.getJSModule(com.facebook.react.uimanager.events.RCTEventEmitter::class.java)
          .receiveEvent(view.id, "onError", com.facebook.react.bridge.Arguments.createMap().apply {
            putString("message", msg)
          })
      }
    }

  @ReactProp(name = "sourceJson") fun setSourceJson(v: ObsidianVideoView, json: String?) { if (json != null) v.load(json) }
  @ReactProp(name = "paused") fun setPaused(v: ObsidianVideoView, paused: Boolean) = v.setPaused(paused)
  @ReactProp(name = "muted") fun setMuted(v: ObsidianVideoView, muted: Boolean) = v.setMuted(muted)
  @ReactProp(name = "volume", defaultDouble = 1.0) fun setVolume(v: ObsidianVideoView, volume: Double) = v.setVolume(volume)
  @ReactProp(name = "rate", defaultDouble = 1.0) fun setRate(v: ObsidianVideoView, rate: Double) = v.setRate(rate)
  @ReactProp(name = "resizeMode") fun setResizeMode(v: ObsidianVideoView, mode: String?) { if (mode != null) v.setResizeMode(mode) }
  @ReactProp(name = "repeat") fun setRepeat(v: ObsidianVideoView, repeat: Boolean) = v.setRepeat(repeat)

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
    MapBuilder.builder<String, Any>()
      .put("onStateChange", MapBuilder.of("registrationName", "onStateChange"))
      .put("onProgress", MapBuilder.of("registrationName", "onProgress"))
      .put("onEnded", MapBuilder.of("registrationName", "onEnded"))
      .put("onError", MapBuilder.of("registrationName", "onError"))
      .put("onBuffering", MapBuilder.of("registrationName", "onBuffering"))
      .build() as MutableMap<String, Any>

  // Command names here MUST match `supportedCommands` in
  // src/specs/NativeObsidianVideo.ts exactly — codegen resolves a dispatched
  // command by this string. They are `apply*` rather than `set*` because a
  // command named `setRate` is emitted into the generated
  // ObsidianVideoManagerInterface as `setRate(T, double)`, colliding with the
  // setter generated for the `rate` prop and failing javac in the host app.
  // See the spec for the full write-up.
  override fun getCommandsMap(): MutableMap<String, Int> =
    mutableMapOf(
      "play" to 1, "pause" to 2, "stop" to 3, "seek" to 4,
      "applyRate" to 5, "applyVolume" to 6, "applyMuted" to 7, "applyResizeMode" to 8
    )

  override fun receiveCommand(root: ObsidianVideoView, commandId: String?, args: ReadableArray?) {
    when (commandId) {
      "play" -> root.commandPlay()
      "pause" -> root.commandPause()
      "stop" -> root.commandStop()
      "seek" -> root.commandSeek(args?.getDouble(0) ?: 0.0)
      "applyRate" -> root.commandSetRate(args?.getDouble(0) ?: 1.0)
      "applyVolume" -> root.commandSetVolume(args?.getDouble(0) ?: 1.0)
      "applyMuted" -> root.commandSetMuted(args?.getBoolean(0) ?: false)
      "applyResizeMode" -> root.commandSetResizeMode(args?.getString(0) ?: "contain")
    }
  }

  // Legacy int command id path (Paper UIManager.dispatchViewManagerCommand)
  override fun receiveCommand(root: ObsidianVideoView, commandId: Int, args: ReadableArray?) {
    when (commandId) {
      1 -> root.commandPlay()
      2 -> root.commandPause()
      3 -> root.commandStop()
      4 -> root.commandSeek(args?.getDouble(0) ?: 0.0)
      5 -> root.commandSetRate(args?.getDouble(0) ?: 1.0)
      6 -> root.commandSetVolume(args?.getDouble(0) ?: 1.0)
      7 -> root.commandSetMuted(args?.getBoolean(0) ?: false)
      8 -> root.commandSetResizeMode(args?.getString(0) ?: "contain")
    }
  }
}
