import AVFoundation
import Foundation

protocol ObsidianAudioEngineDelegate: AnyObject {
  func audioState(_ payload: [String: Any])
  func audioProgress(position: Double, duration: Double)
  func audioEnded()
  func audioError(_ message: String)
}

/// AVPlayer-backed audio engine. Supports streaming (HLS/DASH via AVPlayer),
/// background playback (caller configures AVAudioSession), looping and seeks.
final class ObsidianAudioEngine: NSObject {
  let player = AVPlayer()
  private var timeObserver: Any?
  private var currentURL: String?
  private(set) var loop = false
  weak var delegate: ObsidianAudioEngineDelegate?

  private(set) var lastState: [String: Any] = [
    "status": "idle", "position": 0, "duration": 0, "rate": 1,
    "muted": false, "volume": 1, "buffered": 0, "inBackground": false,
  ]

  override init() {
    super.init()
    player.volume = 1.0
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.25, preferredTimescale: 1000),
      queue: .main
    ) { [weak self] time in
      guard let self = self else { return }
      let position = time.seconds
      let duration = self.player.currentItem?.duration.seconds ?? 0
      self.lastState["position"] = max(0, position)
      self.lastState["duration"] = max(0, duration)
      self.lastState["status"] = self.player.timeControlStatus == .playing ? "playing"
        : (self.player.timeControlStatus == .paused ? "paused" : self.lastState["status"] as? String ?? "loading")
      self.delegate?.audioProgress(position: max(0, position), duration: max(0, duration))
      self.delegate?.audioState(self.lastState)
    }
    NotificationCenter.default.addObserver(
      self, selector: #selector(itemEnded),
      name: .AVPlayerItemDidPlayToEndTime, object: nil
    )
  }

  func configureSession() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .default, options: [.allowAirPlay, .allowBluetooth])
    try? session.setActive(true)
  }

  func load(_ uri: String, headers: [String: String]?, drmLicenseUri: String? = nil) {
    currentURL = uri
    _ = drmLicenseUri // hook for AVContentKeySession / FairPlay
    let asset: AVAsset
    if let headers = headers, !headers.isEmpty {
      asset = AVURLAsset(url: URL(string: uri) ?? URL(fileURLWithPath: uri),
                         options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
    } else {
      asset = AVURLAsset(url: URL(string: uri) ?? URL(fileURLWithPath: uri))
    }
    let item = AVPlayerItem(asset: asset)
    item.addObserver(self, forKeyPath: #keyPath(AVPlayerItem.status), context: nil)
    item.addObserver(self, forKeyPath: #keyPath(AVPlayerItem.loadedTimeRanges), context: nil)
    player.replaceCurrentItem(with: item)
    lastState["status"] = "loading"
    delegate?.audioState(lastState)
  }

  func play() { configureSession(); player.play() }
  func pause() { player.pause() }
  func stop() { player.pause(); player.seek(to: .zero); lastState["status"] = "idle"; delegate?.audioState(lastState) }
  func seek(_ seconds: Double) { player.seek(to: CMTime(seconds: seconds, preferredTimescale: 1000)) }
  func setRate(_ rate: Double) { player.rate = Float(rate); lastState["rate"] = rate }
  func setVolume(_ volume: Double) { player.volume = Float(volume); lastState["volume"] = volume }
  func setMuted(_ muted: Bool) { player.isMuted = muted; lastState["muted"] = muted }
  func setLoop(_ loop: Bool) { self.loop = loop }

  func currentStateJson() -> String {
    (try? JSONSerialization.data(withJSONObject: lastState)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
  }

  override func observeValue(
    forKeyPath keyPath: String?, of object: Any?,
    change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?
  ) {
    guard let item = object as? AVPlayerItem else { return }
    if keyPath == #keyPath(AVPlayerItem.status) {
      switch item.status {
      case .readyToPlay:
        lastState["duration"] = item.duration.seconds
        lastState["status"] = player.timeControlStatus == .playing ? "playing" : "ready"
        delegate?.audioState(lastState)
      case .failed:
        if let err = item.error { delegate?.audioError(err.localizedDescription) }
      default: break
      }
    } else if keyPath == #keyPath(AVPlayerItem.loadedTimeRanges) {
      if let range = item.loadedTimeRanges.last?.timeRangeValue {
        lastState["buffered"] = range.end.seconds
      }
    }
  }

  @objc private func itemEnded() {
    if loop {
      player.seek(to: .zero)
      player.play()
    } else {
      lastState["status"] = "ended"
      delegate?.audioEnded()
      delegate?.audioState(lastState)
    }
  }
}
