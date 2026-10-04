import UIKit

/// Paper (legacy bridge) view manager for <ObsidianVideo>.
@objc(ObsidianVideoManager)
class ObsidianVideoManager: RCTViewManager {
  override func view() -> UIView! { ObsidianVideoView() }

  @objc override static func requiresMainQueueSetup() -> Bool { true }

  private func view(for tag: NSNumber) -> ObsidianVideoView? {
    bridge.uiManager.view(forReactTag: tag) as? ObsidianVideoView
  }

  // These selectors MUST match `supportedCommands` in
  // src/specs/NativeObsidianVideo.ts — the interop layer resolves a dispatched
  // command by name and logs `No command found with name "..."` on a mismatch.
  // `apply*` rather than `set*` because a codegen command named `setRate`
  // collides with the setter generated for the `rate` prop and fails javac in
  // the consuming app. `commandSet*` below is the view's own API and is
  // unrelated to the wire name.
  @objc func play(_ tag: NSNumber) { view(for: tag)?.commandPlay() }
  @objc func pause(_ tag: NSNumber) { view(for: tag)?.commandPause() }
  @objc func stop(_ tag: NSNumber) { view(for: tag)?.commandStop() }
  @objc func seek(_ tag: NSNumber, seconds: NSNumber) { view(for: tag)?.commandSeek(seconds.doubleValue) }
  @objc func applyRate(_ tag: NSNumber, rate: NSNumber) { view(for: tag)?.commandSetRate(rate.doubleValue) }
  @objc func applyVolume(_ tag: NSNumber, volume: NSNumber) { view(for: tag)?.commandSetVolume(volume.doubleValue) }
  @objc func applyMuted(_ tag: NSNumber, muted: Bool) { view(for: tag)?.commandSetMuted(muted) }
  @objc func applyResizeMode(_ tag: NSNumber, mode: NSString) { view(for: tag)?.commandSetResizeMode(mode as String) }
}
