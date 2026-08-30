import AVFoundation
import Foundation
import MediaPlayer

@objc(ObsidianMusicPlayer)
class ObsidianMusicPlayer: RCTEventEmitter {
  private let player = AVPlayer()
  private let remote = ObsidianRemoteControls()
  private var tracks: [MusicTrack] = []
  private var order: [Int] = []
  private var cursor = 0
  private var repeatMode = "off"   // off | track | queue
  private var shuffle = false
  private var listeners = Set<String>()
  private var timeObserver: Any?

  private(set) var lastState: [String: Any] = [
    "status": "idle", "position": 0, "duration": 0, "rate": 1,
    "muted": false, "volume": 1, "buffered": 0, "inBackground": false,
  ]

  override init() {
    super.init()
    remote.onCommand = { [weak self] cmd in self?.handleRemoteCommand(cmd) }
    remote.onSeek = { [weak self] pos in self?.player.seek(to: CMTime(seconds: pos, preferredTimescale: 1000)) }
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.25, preferredTimescale: 1000),
      queue: .main
    ) { [weak self] time in
      guard let self = self else { return }
      self.lastState["position"] = max(0, time.seconds)
      self.lastState["duration"] = self.player.currentItem?.duration.seconds ?? 0
      self.delegateProgress()
    }
    NotificationCenter.default.addObserver(
      self, selector: #selector(itemEnded),
      name: .AVPlayerItemDidPlayToEndTime, object: nil
    )
  }

  @objc override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String] {
    ["onState", "onProgress", "onTrackChange", "onQueueChange", "onRemoteCommand", "onEnded", "onError"]
  }

  @objc func addListener(_ eventName: String) { listeners.insert(eventName) }
  @objc func removeListeners(_ count: Double) {
    if Int(count) >= listeners.count { listeners.removeAll() }
  }

  private func emit(_ name: String, _ body: [String: Any]) {
    if listeners.contains(name) || listeners.isEmpty { sendEvent(withName: name, body: body) }
  }

  // MARK: - Queue

  private func rebuildOrder(preserveCurrent: Bool = true) {
    let n = tracks.count
    order = Array(0..<n)
    if shuffle, n > 1 {
      for i in (1..<n).reversed() {
        let j = Int.random(in: 0...i)
        order.swapAt(i, j)
      }
      if preserveCurrent, n > 0 {
        let active = currentIndex()
        if let pos = order.firstIndex(of: active), pos != 0 {
          order.swapAt(0, pos)
        }
      }
    }
    if cursor >= order.count { cursor = 0 }
  }

  private func currentIndex() -> Int { order.isEmpty ? -1 : order[cursor] }

  private func loadCurrent(autoPlay: Bool = false) {
    guard !order.isEmpty else { return }
    let idx = order[cursor]
    let track = tracks[idx]
    let asset = AVURLAsset(
      url: URL(string: track.source.uri) ?? URL(fileURLWithPath: track.source.uri),
      options: track.source.headers.map { ["AVURLAssetHTTPHeaderFieldsKey": $0] } ?? [:]
    )
    let item = AVPlayerItem(asset: asset)
    item.addObserver(self, forKeyPath: #keyPath(AVPlayerItem.status), context: nil)
    item.addObserver(self, forKeyPath: #keyPath(AVPlayerItem.loadedTimeRanges), context: nil)
    player.replaceCurrentItem(with: item)
    lastState["status"] = "loading"
    updateNowPlaying()
    emit("onTrackChange", ["index": idx, "trackJson": trackJson(at: idx)])
    emit("onState", ["stateJson": stateJson()])
    if autoPlay { player.play() }
  }

  @objc func setQueue(_ tracksJson: String) {
    tracks = decodeTracks(tracksJson)
    rebuildOrder(preserveCurrent: false)
    cursor = 0
    loadCurrent()
    emitQueue()
  }
  @objc func addTracks(_ tracksJson: String) {
    tracks.append(contentsOf: decodeTracks(tracksJson))
    rebuildOrder()
    emitQueue()
  }
  @objc func removeTrack(_ id: String) {
    tracks.removeAll { $0.id == id }
    rebuildOrder()
    emitQueue()
    loadCurrent()
  }
  @objc func skipTo(_ index: Double) {
    let target = Int(index)
    if let pos = order.firstIndex(of: target) { cursor = pos }
    else if target < tracks.count { cursor = max(0, order.firstIndex(of: target) ?? 0) }
    loadCurrent()
  }
  @objc func next() {
    if order.isEmpty { return }
    if cursor < order.count - 1 { cursor += 1 }
    else if repeatMode == "queue" { cursor = 0 }
    else { lastState["status"] = "ended"; emit("onEnded", [:]); return }
    loadCurrent(autoPlay: true)
  }
  @objc func previous() {
    if order.isEmpty { return }
    if cursor > 0 { cursor -= 1 }
    else if repeatMode == "queue" { cursor = order.count - 1 }
    loadCurrent(autoPlay: true)
  }

  // MARK: - Transport

  @objc func play() { configureSession(); player.play() }
  @objc func pause() { player.pause() }
  @objc func stop() { player.pause(); player.seek(to: .zero) }
  @objc(seek:) func seek(_ seconds: Double) { player.seek(to: CMTime(seconds: seconds, preferredTimescale: 1000)) }
  @objc(setRate:) func setRate(_ rate: Double) { player.rate = Float(rate); lastState["rate"] = rate }
  @objc(setVolume:) func setVolume(_ volume: Double) { player.volume = Float(volume); lastState["volume"] = volume }
  @objc(setMuted:) func setMuted(_ muted: Bool) { player.isMuted = muted; lastState["muted"] = muted }
  @objc(setRepeatMode:) func setRepeatMode(_ mode: String) { repeatMode = mode }
  @objc(setShuffle:) func setShuffle(_ s: Bool) { shuffle = s; rebuildOrder() }

  @objc func setRemoteControls(_ optionsJson: String) {
    let opts = (try? JSONDecoder().decode(RemoteControlOptions.self, from: Data(optionsJson.utf8))) ?? RemoteControlOptions()
    remote.setEnabled(true, options: opts)
  }
  @objc func setBackgroundEnabled(_ enabled: Bool) {
    if enabled {
      configureSession()
      remote.setEnabled(true)
    } else {
      remote.unregister()
      try? AVAudioSession.sharedInstance().setActive(false)
    }
  }

  @objc func getCurrentState(_ resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
    resolve(stateJson())
  }
  @objc func getCurrentQueue(_ resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
    resolve(queueJson())
  }

  // MARK: - Internals

  private func configureSession() {
    let s = AVAudioSession.sharedInstance()
    try? s.setCategory(.playback, mode: .default, options: [.allowAirPlay, .allowBluetooth])
    try? s.setActive(true)
  }

  private func handleRemoteCommand(_ cmd: String) {
    switch cmd {
    case "play": player.play()
    case "pause": player.pause()
    case "next": next()
    case "previous": previous()
    default: break
    }
    emit("onRemoteCommand", ["command": cmd])
  }

  private func updateNowPlaying() {
    guard !order.isEmpty else { return }
    let t = tracks[order[cursor]]
    var info: [String: Any] = [:]
    if let title = t.title { info[MPMediaItemPropertyTitle] = title }
    if let artist = t.artist { info[MPMediaItemPropertyArtist] = artist }
    if let album = t.album { info[MPMediaItemPropertyAlbumTitle] = album }
    info[MPMediaItemPropertyPlaybackDuration] = player.currentItem?.duration.seconds ?? 0
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = player.currentTime().seconds
    info[MPNowPlayingInfoPropertyPlaybackRate] = player.rate
    remote.updateNowPlaying(info)
  }

  private func decodeTracks(_ json: String) -> [MusicTrack] {
    (try? JSONDecoder().decode([MusicTrack].self, from: Data(json.utf8))) ?? []
  }
  private func trackJson(at index: Int) -> String {
    (try? String(data: JSONEncoder().encode(tracks[index]), encoding: .utf8)) ?? "{}"
  }
  private func queueJson() -> String {
    let simple: [String: Any] = ["index": currentIndex(), "ids": tracks.map { $0.id }]
    return (try? JSONSerialization.data(withJSONObject: simple)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
  }
  private func stateJson() -> String {
    (try? JSONSerialization.data(withJSONObject: lastState)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
  }
  private func emitQueue() {
    emit("onQueueChange", ["tracks": tracks.map { $0.id }, "index": currentIndex()])
  }
  private func delegateProgress() {
    emit("onProgress", ["position": lastState["position"] as? Double ?? 0,
                        "duration": lastState["duration"] as? Double ?? 0])
    emit("onState", ["stateJson": stateJson()])
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
        updateNowPlaying()
        emit("onState", ["stateJson": stateJson()])
      case .failed:
        if let err = item.error { emit("onError", ["message": err.localizedDescription]) }
      default: break
      }
    } else if keyPath == #keyPath(AVPlayerItem.loadedTimeRanges) {
      if let range = item.loadedTimeRanges.last?.timeRangeValue { lastState["buffered"] = range.end.seconds }
    }
  }

  @objc private func itemEnded() {
    if repeatMode == "track" {
      player.seek(to: .zero); player.play()
    } else {
      next()
    }
  }
}

#if RCT_NEW_ARCH_ENABLED
import ObsidianMediaPlayerSpec
extension ObsidianMusicPlayer: ObsidianMusicPlayerSpec {}
#endif
