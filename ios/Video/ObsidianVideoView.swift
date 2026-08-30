import UIKit

/// Paper (legacy bridge) video surface. Backed by `ObsidianVideoPlayer`.
final class ObsidianVideoView: UIView {
  private let media: ObsidianVideoPlayer

  // Direct-event blocks populated by React from the JS props.
  @objc var onStateChange: RCTDirectEventBlock?
  @objc var onProgress: RCTDirectEventBlock?
  @objc var onBuffering: RCTDirectEventBlock?
  @objc var onEnded: RCTDirectEventBlock?
  @objc var onError: RCTDirectEventBlock?

  override init(frame: CGRect) {
    media = ObsidianVideoPlayer()
    super.init(frame: frame)
    media.delegate = self
    media.attach(to: self)
  }

  required init?(coder: NSCoder) {
    media = ObsidianVideoPlayer()
    super.init(coder: coder)
    media.delegate = self
    media.attach(to: self)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    media.layout(in: bounds)
  }

  // MARK: - Prop setters (Paper)

  @objc func setSourceJson(_ json: String) {
    guard let data = json.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let uri = obj["uri"] as? String else { return }
    let headers = obj["headers"] as? [String: String]
    media.load(uri, headers: headers, cacheable: obj["cacheable"] as? Bool ?? true, drmLicenseUri: obj["drmLicenseUri"] as? String)
  }

  @objc func setPaused(_ paused: Bool) {
    if paused { media.pause() } else { media.play() }
  }
  @objc func setMuted(_ muted: Bool) { media.setMuted(muted) }
  @objc func setVolume(_ volume: NSNumber) { media.setVolume(volume.doubleValue) }
  @objc func setRate(_ rate: NSNumber) { media.setRate(rate.doubleValue) }
  @objc func setResizeMode(_ mode: String) { media.resizeMode = mode }
  @objc func setRepeat(_ repeatMode: Bool) { /* loop handled on ended */ }

  // MARK: - Commands (Paper)

  @objc func commandPlay() { media.play() }
  @objc func commandPause() { media.pause() }
  @objc func commandStop() { media.stop() }
  @objc func commandSeek(_ seconds: Double) { media.seek(seconds) }
  @objc func commandSetRate(_ rate: Double) { media.setRate(rate) }
  @objc func commandSetVolume(_ volume: Double) { media.setVolume(volume) }
  @objc func commandSetMuted(_ muted: Bool) { media.setMuted(muted) }
  @objc func commandSetResizeMode(_ mode: String) { media.resizeMode = mode }
}

extension ObsidianVideoView: ObsidianVideoPlayerDelegate {
  func videoPlayerState(_ payload: [String: Any]) {
    guard let json = try? JSONSerialization.data(withJSONObject: payload),
          let str = String(data: json, encoding: .utf8) else { return }
    onStateChange?(["stateJson": str])
  }
  func videoPlayerProgress(position: Double, duration: Double) {
    onProgress?(["position": position, "duration": duration])
  }
  func videoPlayerEnded() { onEnded?(nil) }
  func videoPlayerError(_ message: String) { onError?(["message": message]) }
}
