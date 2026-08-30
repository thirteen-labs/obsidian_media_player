import UIKit

/// Paper (legacy bridge) view manager for <ObsidianVideo>.
@objc(ObsidianVideoManager)
class ObsidianVideoManager: RCTViewManager {
  override func view() -> UIView! { ObsidianVideoView() }

  @objc override static func requiresMainQueueSetup() -> Bool { true }

  private func view(for tag: NSNumber) -> ObsidianVideoView? {
    bridge.uiManager.view(forReactTag: tag) as? ObsidianVideoView
  }

  @objc func play(_ tag: NSNumber) { view(for: tag)?.commandPlay() }
  @objc func pause(_ tag: NSNumber) { view(for: tag)?.commandPause() }
  @objc func stop(_ tag: NSNumber) { view(for: tag)?.commandStop() }
  @objc func seek(_ tag: NSNumber, seconds: NSNumber) { view(for: tag)?.commandSeek(seconds.doubleValue) }
  @objc func setRate(_ tag: NSNumber, rate: NSNumber) { view(for: tag)?.commandSetRate(rate.doubleValue) }
  @objc func setVolume(_ tag: NSNumber, volume: NSNumber) { view(for: tag)?.commandSetVolume(volume.doubleValue) }
  @objc func setMuted(_ tag: NSNumber, muted: Bool) { view(for: tag)?.commandSetMuted(muted) }
  @objc func setResizeMode(_ tag: NSNumber, mode: NSString) { view(for: tag)?.commandSetResizeMode(mode as String) }
}
