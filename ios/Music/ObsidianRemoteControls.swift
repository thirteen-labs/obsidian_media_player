import MediaPlayer
import Foundation

/// Wraps MPRemoteCommandCenter + MPNowPlayingInfoCenter for lock-screen /
/// headset / CarPlay controls.
final class ObsidianRemoteControls: NSObject {
  var onCommand: ((String) -> Void)?
  var onSeek: ((Double) -> Void)?

  private let center = MPRemoteCommandCenter.shared()

  func setEnabled(_ enabled: Bool, options: RemoteControlOptions = .init()) {
    unregister()
    if !enabled { return }

    if options.enablePlayPause ?? true {
      center.playCommand.addTarget(self, action: #selector(play))
      center.pauseCommand.addTarget(self, action: #selector(pause))
    }
    if options.enableSkip ?? true {
      center.nextTrackCommand.addTarget(self, action: #selector(next))
      center.previousTrackCommand.addTarget(self, action: #selector(previous))
    }
    if options.enableSeek ?? true {
      center.seekForwardCommand.addTarget(self, action: #selector(seekForward))
      center.seekBackwardCommand.addTarget(self, action: #selector(seekBackward))
      center.changePlaybackPositionCommand.addTarget(self, action: #selector(seekTo))
    }
  }

  func updateNowPlaying(_ info: [String: Any]) {
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  func unregister() {
    center.playCommand.removeTarget(self)
    center.pauseCommand.removeTarget(self)
    center.nextTrackCommand.removeTarget(self)
    center.previousTrackCommand.removeTarget(self)
    center.seekForwardCommand.removeTarget(self)
    center.seekBackwardCommand.removeTarget(self)
    center.changePlaybackPositionCommand.removeTarget(self)
  }

  @objc private func play() { onCommand?("play") }
  @objc private func pause() { onCommand?("pause") }
  @objc private func next() { onCommand?("next") }
  @objc private func previous() { onCommand?("previous") }
  @objc private func seekForward() { onCommand?("seek") }
  @objc private func seekBackward() { onCommand?("seek") }
  @objc private func seekTo(_ event: MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus {
    if let evt = event as? MPChangePlaybackPositionCommandEvent {
      onSeek?(evt.positionTime)
      onCommand?("seek")
    }
    return .success
  }
}

struct RemoteControlOptions: Decodable {
  var enablePlayPause: Bool?
  var enableSkip: Bool?
  var enableSeek: Bool?
  var enableLike: Bool?
}

struct MusicTrack: Decodable {
  let id: String
  let source: MusicSource
  let title: String?
  let artist: String?
  let album: String?
  let artwork: String?
  let duration: Double?

  struct MusicSource: Decodable {
    let uri: String
    let headers: [String: String]?
  }
}
