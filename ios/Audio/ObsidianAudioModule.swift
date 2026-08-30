import Foundation

/// Headless Audio player. Works as an RCTBridgeModule (Paper) and as a
/// TurboModule (New Architecture) by conforming to the generated
/// `ObsidianAudioSpec` protocol when codegen is enabled.
@objc(ObsidianAudio)
class ObsidianAudio: RCTEventEmitter {
  private let engine = ObsidianAudioEngine()
  private var listeners = Set<String>()

  override init() {
    super.init()
    engine.delegate = self
  }

  @objc override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String] {
    ["onState", "onProgress", "onEnded", "onError"]
  }

  // MARK: - Listener bookkeeping (TurboModule + bridge)

  @objc func addListener(_ eventName: String) { listeners.insert(eventName) }
  @objc func removeListeners(_ count: Double) {
    if Int(count) >= listeners.count { listeners.removeAll() }
  }

  private func emit(_ name: String, _ body: [String: Any]) {
    if listeners.contains(name) || listeners.isEmpty {
      sendEvent(withName: name, body: body)
    }
  }

  // MARK: - Commands

  @objc(load:) func load(_ sourceJson: String) {
    guard let data = sourceJson.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let uri = obj["uri"] as? String else { return }
    engine.load(uri, headers: obj["headers"] as? [String: String], drmLicenseUri: obj["drmLicenseUri"] as? String)
  }
  @objc func play() { engine.play() }
  @objc func pause() { engine.pause() }
  @objc func stop() { engine.stop() }
  @objc(seek:) func seek(_ seconds: Double) { engine.seek(seconds) }
  @objc(setRate:) func setRate(_ rate: Double) { engine.setRate(rate) }
  @objc(setVolume:) func setVolume(_ volume: Double) { engine.setVolume(volume) }
  @objc(setMuted:) func setMuted(_ muted: Bool) { engine.setMuted(muted) }
  @objc(setLoop:) func setLoop(_ loop: Bool) { engine.setLoop(loop) }

  @objc func getCurrentState(_ resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
    resolve(engine.currentStateJson())
  }

  // MARK: - New Architecture TurboModule conformance

  #if RCT_NEW_ARCH_ENABLED
  // Conformance to the generated ObsidianAudioSpec protocol (see bottom).
  #endif
}

extension ObsidianAudio: ObsidianAudioEngineDelegate {
  func audioState(_ payload: [String: Any]) { emit("onState", ["stateJson": stateJson(payload)]) }
  func audioProgress(position: Double, duration: Double) {
    emit("onProgress", ["position": position, "duration": duration])
  }
  func audioEnded() { emit("onEnded", [:]) }
  func audioError(_ message: String) { emit("onError", ["message": message]) }

  private func stateJson(_ payload: [String: Any]) -> String {
    (try? JSONSerialization.data(withJSONObject: payload))
      .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
  }
}

#if RCT_NEW_ARCH_ENABLED
import ObsidianMediaPlayerSpec
extension ObsidianAudio: ObsidianAudioSpec {}
#endif
