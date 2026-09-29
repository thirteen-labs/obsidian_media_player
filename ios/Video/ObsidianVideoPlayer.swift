import AVFoundation
import Foundation

protocol ObsidianVideoPlayerDelegate: AnyObject {
  func videoPlayerState(_ payload: [String: Any])
  func videoPlayerProgress(position: Double, duration: Double)
  func videoPlayerEnded()
  func videoPlayerError(_ message: String)
  /// Fired once on entry to a stall and once on exit. `buffered` is seconds
  /// of media currently loaded.
  func videoPlayerBuffering(_ buffered: Double)
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

  /// Loop the current item when it reaches the end. Set by
  /// `ObsidianVideoView.setRepeat`. Mirrors ExoPlayer's REPEAT_MODE_ONE on
  /// Android (`player.repeatMode = REPEAT_MODE_ONE`, ObsidianVideoView.kt:96).
  private(set) var repeat = false

  func setRepeat(_ enabled: Bool) { repeat = enabled }

  // Edge-triggered. `videoPlayerBuffering` fires on transitions only, not on
  // every 250 ms tick while stalled. Android uses the same rule in
  // ObsidianVideoView.onPlaybackStateChanged.
  private var isBuffering = false

  /// Single source of truth for `status`, so the periodic observer and the
  /// buffering edge cannot disagree.
  ///
  /// AVPlayer reports a stall as `timeControlStatus == .waitingToPlay`, which
  /// is the iOS counterpart of ExoPlayer's `STATE_BUFFERING`.
  private func updateBufferingState() {
    let buffering = player.timeControlStatus == .waitingToPlay
    if buffering != isBuffering {
      isBuffering = buffering
      delegate?.videoPlayerBuffering(lastState["buffered"] as? Double ?? 0)
    }
    switch player.timeControlStatus {
    case .playing: lastState["status"] = "playing"
    case .waitingToPlay: lastState["status"] = "buffering"
    case .paused: lastState["status"] = "paused"
    @unknown default: break
    }
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

  func load(_ uri: String, headers: [String: String]?, cacheable: Bool) {
    var asset: AVAsset
    if let headers = headers, !headers.isEmpty {
      let options: [String: Any] = ["AVURLAssetHTTPHeaderFieldsKey": headers]
      asset = AVURLAsset(url: URL(string: uri) ?? URL(fileURLWithPath: uri), options: options)
    } else {
      asset = AVURLAsset(url: URL(string: uri) ?? URL(fileURLWithPath: uri))
    }
    // NOTE: DRM is not supported. `MediaSource.drmLicenseUri` was removed in
    // 0.3.0 because it was a pure passthrough that reached this point and was
    // discarded, so protected content failed as a bare playback error rather
    // than a licence failure. FairPlay needs AVContentKeySession + an
    // AVAssetResourceLoaderDelegate and the com.apple.developer.fps
    // entitlement; see to-be-done.md FG-6.2.
    let item = AVPlayerItem(asset: asset)
    player.replaceCurrentItem(with: item)
    // A fresh item has not started buffering, so re-arm the edge trigger.
    isBuffering = false
    emit(state: "loading")
    observeItem(item)
  }

  func play() {
    // Re-arm a finished item. If the item already ended while `repeat` was
    // off, `itemDidEnd` has run and `play()` alone would sit at the last frame
    // forever. ExoPlayer does not need this — `seekToDefaultPosition` is
    // implicit on REPEAT_MODE_ONE — so it is the price of driving AVPlayer
    // manually.
    if repeat, lastState["status"] as? String == "ended" {
      player.seek(to: .zero)
    }
    player.play()
  }
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
    // AVPlayerLayer has no true "no scaling" mode. `.resize` fills the layer
    // with no aspect correction, which is the closest honest match — it is
    // what Android's identity Matrix does for `none`. This is an
    // approximation; see to-be-done.md FG-0.3.
    case "none": layer.videoGravity = .resize
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
      self.updateBufferingState()
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
    // `repeat` loops silently: no `onEnded`, no "ended" status, no state emit
    // at all — exactly what ExoPlayer's REPEAT_MODE_ONE does on Android. The
    // 250 ms time observer restores `status` from `timeControlStatus` on its
    // next tick, so there is nothing to correct by hand here.
    if repeat {
      player.seek(to: .zero)
      player.play()
      return
    }
    lastState["status"] = "ended"
    delegate?.videoPlayerEnded()
    delegate?.videoPlayerState(lastState)
  }

  private func emit(state status: String) {
    lastState["status"] = status
    delegate?.videoPlayerState(lastState)
  }
}
