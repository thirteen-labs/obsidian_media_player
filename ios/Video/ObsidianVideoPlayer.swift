import AVFoundation
import Foundation

protocol ObsidianVideoPlayerDelegate: AnyObject {
  func videoPlayerState(_ payload: [String: Any])
  func videoPlayerProgress(position: Double, duration: Double)
  func videoPlayerEnded()
  func videoPlayerError(_ message: String)
}

/// Shared AVPlayer wrapper used by both the Paper (UIView) and Fabric
/// (RCTViewComponentView) video views.
final class ObsidianVideoPlayer: NSObject {
  let player = AVPlayer()
  private let layer = AVPlayerLayer()
  private var timeObserver: Any?
  weak var delegate: ObsidianVideoPlayerDelegate?

  var resizeMode: String = "contain" {
    didSet { applyResizeMode() }
  }

  private(set) var lastState: [String: Any] = [
    "status": "idle",
    "position": 0,
    "duration": 0,
    "rate": 1,
    "muted": false,
    "volume": 1,
    "buffered": 0,
    "inBackground": false,
  ]

  init() {
    layer.player = player
    player.volume = 1.0
    addObservers()
  }

  var videoLayer: AVPlayerLayer { layer }

  func attach(to view: UIView) {
    layer.frame = view.bounds
    view.layer.addSublayer(layer)
  }

  func layout(in rect: CGRect) {
    layer.frame = rect
  }

  // MARK: - Commands

  func load(_ uri: String, headers: [String: String]?, cacheable: Bool, drmLicenseUri: String? = nil) {
    var asset: AVAsset
    if let headers = headers, !headers.isEmpty {
      let options: [String: Any] = ["AVURLAssetHTTPHeaderFieldsKey": headers]
      asset = AVURLAsset(url: URL(string: uri) ?? URL(fileURLWithPath: uri), options: options)
    } else {
      asset = AVURLAsset(url: URL(string: uri) ?? URL(fileURLWithPath: uri))
    }
    // drmLicenseUri would be wired to AVContentKeySession for FairPlay here.
    // Kept as a hook so the host app can add its key server without this scaffold
    // requiring the FairPlay entitlement.
    _ = drmLicenseUri
    let item = AVPlayerItem(asset: asset)
    player.replaceCurrentItem(with: item)
    emit(state: "loading")
    observeItem(item)
  }

  func play() { player.play() }
  func pause() { player.pause() }
  func stop() {
    player.pause()
    player.seek(to: .zero)
    emit(state: "idle")
  }

  func seek(_ seconds: Double) {
    player.seek(to: CMTime(seconds: seconds, preferredTimescale: 1000))
  }

  func setRate(_ rate: Double) { player.rate = Float(rate) }
  func setVolume(_ volume: Double) {
    player.volume = Float(volume)
    lastState["volume"] = volume
  }
  func setMuted(_ muted: Bool) {
    player.isMuted = muted
    lastState["muted"] = muted
  }

  private func applyResizeMode() {
    switch resizeMode {
    case "cover": layer.videoGravity = .resizeAspectFill
    case "stretch": layer.videoGravity = .resize
    default: layer.videoGravity = .resizeAspect
    }
  }

  // MARK: - Observers

  private func addObservers() {
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.25, preferredTimescale: 1000),
      queue: .main
    ) { [weak self] time in
      guard let self = self else { return }
      let position = time.seconds
      let duration = self.player.currentItem?.duration.seconds ?? 0
      self.lastState["position"] = max(0, position)
      self.lastState["duration"] = max(0, duration)
      if self.player.timeControlStatus == .playing {
        self.lastState["status"] = "playing"
      } else if self.player.timeControlStatus == .paused {
        self.lastState["status"] = "paused"
      }
      self.delegate?.videoPlayerProgress(position: max(0, position), duration: max(0, duration))
      self.delegate?.videoPlayerState(self.lastState)
    }

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(itemDidEnd),
      name: .AVPlayerItemDidPlayToEndTime,
      object: nil
    )
  }

  private func observeItem(_ item: AVPlayerItem) {
    item.addObserver(self, forKeyPath: #keyPath(AVPlayerItem.status), context: nil)
    item.addObserver(self, forKeyPath: #keyPath(AVPlayerItem.loadedTimeRanges), context: nil)
  }

  override func observeValue(
    forKeyPath keyPath: String?,
    of object: Any?,
    change: [NSKeyValueChangeKey: Any]?,
    context: UnsafeMutableRawPointer?
  ) {
    guard let item = object as? AVPlayerItem else { return }
    if keyPath == #keyPath(AVPlayerItem.status) {
      switch item.status {
      case .readyToPlay:
        lastState["duration"] = item.duration.seconds
        emit(state: player.timeControlStatus == .playing ? "playing" : "ready")
      case .failed:
        if let err = item.error { delegate?.videoPlayerError(err.localizedDescription) }
      default: break
      }
    } else if keyPath == #keyPath(AVPlayerItem.loadedTimeRanges) {
      if let range = item.loadedTimeRanges.last?.timeRangeValue {
        lastState["buffered"] = range.end.seconds
      }
    }
  }

  @objc private func itemDidEnd() {
    lastState["status"] = "ended"
    delegate?.videoPlayerEnded()
    delegate?.videoPlayerState(lastState)
  }

  private func emit(state status: String) {
    lastState["status"] = status
    delegate?.videoPlayerState(lastState)
  }
}
