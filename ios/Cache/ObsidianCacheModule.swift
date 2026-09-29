import Foundation
import AVFoundation

/// Offline cache + download manager. Persists a download index in UserDefaults
/// and progressive downloads in ApplicationSupport/obsidian-media-cache.
/// HLS via AVAssetDownloadURLSession when the `com.apple.developer.avassetdownload`
/// entitlement is present; otherwise falls back to progressive file cache + URLCache.
@objc(ObsidianCache)
class ObsidianCache: NSObject, AVAssetDownloadDelegate {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  // MARK: - Index helpers (UserDefaults)

  private let indexKey = "obsidian_downloads_index"
  private let cacheDirName = "obsidian-media-cache"

  private var cacheDirectory: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
    let dir = base.appendingPathComponent(cacheDirName)
    if !FileManager.default.fileExists(atPath: dir.path) {
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }
    return dir
  }

  private func readIndex() -> [[String: Any]] {
    guard let data = UserDefaults.standard.data(forKey: indexKey),
          let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      return []
    }
    return arr
  }

  private func writeIndex(_ arr: [[String: Any]]) {
    if let data = try? JSONSerialization.data(withJSONObject: arr) {
      UserDefaults.standard.set(data, forKey: indexKey)
    }
  }

  private func upsertEntry(id: String, uri: String, status: String, bytesDownloaded: Int64 = 0, bytesTotal: Int64 = 0, type: String = "", localUri: String? = nil) {
    var arr = readIndex()
    if let idx = arr.firstIndex(where: { $0["id"] as? String == id }) {
      var e = arr[idx]
      e["uri"] = uri
      e["status"] = status
      e["bytesDownloaded"] = bytesDownloaded
      e["bytesTotal"] = bytesTotal
      if !type.isEmpty { e["type"] = type }
      // Set only when this call supplies one, cleared otherwise. A download that
      // fails or restarts must not leave a `localUri` pointing at a file which is
      // no longer there — that stale path is exactly what FG-5.1's `preferCache`
      // step was meant to prevent, and on iOS there is a real local file to go
      // stale.
      if let localUri = localUri { e["localUri"] = localUri } else { e.removeValue(forKey: "localUri") }
      arr[idx] = e
    } else {
      var e: [String: Any] = ["id": id, "uri": uri, "type": type, "status": status, "bytesDownloaded": bytesDownloaded, "bytesTotal": bytesTotal]
      if let localUri = localUri { e["localUri"] = localUri }
      arr.append(e)
    }
    writeIndex(arr)
  }

  /// The remote URI recorded for `id`.
  ///
  /// Read back from the index rather than reconstructed. The "downloading" entry
  /// already holds the URL the caller asked for, which for HLS is a `.m3u8`
  /// manifest. The completion callback only has the *local* asset location, so
  /// writing that into `uri` — as this used to — replaced the source URL with a
  /// file path and left the caller with no way to name the original stream.
  private func indexURI(for id: String) -> String {
    return readIndex().first(where: { $0["id"] as? String == id })?["uri"] as? String ?? ""
  }

  private func fileURL(for id: String, uri: String) -> URL {
    let ext = (URL(string: uri)?.pathExtension ?? "").isEmpty ? "mp4" : (URL(string: uri)!.pathExtension)
    // Sanitize id for filesystem
    let safeId = id.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: ":", with: "_")
    return cacheDirectory.appendingPathComponent("\(safeId).\(ext)")
  }

  // MARK: - HLS download task tracking

  /// Active HLS download tasks, keyed by download id. Persisted across app
  /// launches via the index; tasks themselves are recreated on launch.
  private var hlsTasks: [String: AVAssetDownloadTask] = [:]

  // MARK: - AVAssetDownloadDelegate

  /// Called when the asset download completes successfully.
  /// FG-5.3: this is the real completion signal — the previous code marked
  /// "done" after a hardcoded 2s regardless of outcome.
  func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didFinishDownloadingTo location: URL) {
    guard let id = assetDownloadTask.description.components(separatedBy: " ").first else { return }
    let taskId = hlsTasks.first(where: { $0.value === assetDownloadTask })?.key ?? id
    // Name the file after the *local* location, not the remote manifest: an
    // `.m3u8` source downloads to a media bundle, so deriving the extension from
    // the source URL produced a `.m3u8`-named file for MP4 segments.
    let dest = fileURL(for: taskId, uri: location.absoluteString)
    do {
      if FileManager.default.fileExists(atPath: dest.path) {
        try FileManager.default.removeItem(at: dest)
      }
      try FileManager.default.moveItem(at: location, to: dest)
      let attrs = try? FileManager.default.attributesOfItem(atPath: dest.path)
      let size = (attrs?[.size] as? Int64) ?? 0
      // `uri` stays the source the caller asked for; `localUri` is the copy on
      // disk. Writing the local path into `uri` (as this used to) is why
      // `DownloadInfo.uri` reported a `file:` URL for HLS downloads.
      upsertEntry(id: taskId, uri: indexURI(for: taskId), status: "done",
                  bytesDownloaded: size, bytesTotal: size,
                  localUri: dest.absoluteString)
    } catch {
      upsertEntry(id: taskId, uri: indexURI(for: taskId), status: "error")
    }
    hlsTasks.removeValue(forKey: taskId)
  }

  /// Called periodically during download with progress updates.
  func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didLoad timeRange: CMTimeRange, totalTimeRangesLoaded loaded: [CMTimeRange], timeRangeExpectedToLoad: CMTimeRange) {
    // Progress tracking for HLS is best-effort; the index is updated on completion.
    // Could be extended to emit progress events via RCTEventEmitter.
  }

  /// Called when the download completes (successfully or with an error).
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error = error {
      // Find which download id this task belongs to
      for (id, hlsTask) in hlsTasks {
        if hlsTask === task as? AVAssetDownloadTask {
          upsertEntry(id: id, uri: "", status: "error")
          hlsTasks.removeValue(forKey: id)
          break
        }
      }
    }
  }

  // MARK: - TurboModule / bridge exports

  @objc func download(_ id: String, sourceJson: String,
                      resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    guard let data = sourceJson.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let uriStr = obj["uri"] as? String,
          let url = URL(string: uriStr) else {
      resolve("{}"); return
    }
    let type = (obj["type"] as? String) ?? ""
    let headers = obj["headers"] as? [String: String]

    // Mark downloading immediately so getDownloads is pollable
    upsertEntry(id: id, uri: uriStr, status: "downloading", type: type)

    // HLS special path — AVAssetDownloadURLSession when entitlement is present
    let isHLS = uriStr.lowercased().contains(".m3u8") || type.lowercased() == "hls"
    if isHLS {
      // No `#available` guard: the podspec floors at iOS 13 and
      // AVAssetDownloadURLSession landed in iOS 10, so the check was always
      // true. See to-be-done.md FG-3.2 step 5.
      //
      // Check if AVAssetDownloadURLSession is usable (entitlement gate).
      // If creation fails we fall through to progressive path.
      let config = URLSessionConfiguration.background(withIdentifier: "obsidian-hls-\(id)")
      // FG-5.3: pass `self` as the delegate so completion/error callbacks fire.
      // Previously this was `nil`, so no callback ever fired and the entry was
      // marked "done" after a hardcoded 2s regardless of outcome.
      let session = AVAssetDownloadURLSession(configuration: config, assetDownloadDelegate: self, delegateQueue: .main)
      let asset = AVURLAsset(url: url, options: headers.map { ["AVURLAssetHTTPHeaderFieldsKey": $0] })
      let task = session.makeAssetDownloadTask(asset: asset, assetTitle: id, assetArtworkData: nil, options: nil)
      if let task = task {
        hlsTasks[id] = task
        task.resume()
        resolve("{\"id\":\"\(id)\",\"uri\":\"\(uriStr)\",\"status\":\"downloading\"}")
        return
      }
      // No entitlement: fallback to progressive cache of master playlist (best-effort)
      // Still resolve as downloading, then fetch playlist text to cache
    }

    // Progressive path: download file to ApplicationSupport/obsidian-media-cache/<id>.<ext>
    let dest = fileURL(for: id, uri: uriStr)
    var request = URLRequest(url: url)
    headers?.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }

    let task = URLSession.shared.downloadTask(with: request) { [weak self] tmpURL, response, error in
      guard let self = self else { return }
      if let error = error {
        self.upsertEntry(id: id, uri: uriStr, status: "error", type: type)
        return
      }
      guard let tmpURL = tmpURL else {
        self.upsertEntry(id: id, uri: uriStr, status: "error", type: type)
        return
      }
      do {
        if FileManager.default.fileExists(atPath: dest.path) {
          try FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.moveItem(at: tmpURL, to: dest)
        let attrs = try? FileManager.default.attributesOfItem(atPath: dest.path)
        let size = (attrs?[.size] as? Int64) ?? 0
        // FG-5.2: store real bytesDownloaded and bytesTotal (both = file size on completion)
        // FG-5.1: `localUri` is the copy on disk. iOS is the one platform where
        // that is a real, directly playable `file:` URL — Android's SimpleCache
        // serves the *remote* URI from disk instead, so it has no equivalent.
        self.upsertEntry(id: id, uri: uriStr, status: "done", bytesDownloaded: size, bytesTotal: size, type: type, localUri: dest.absoluteString)
      } catch {
        self.upsertEntry(id: id, uri: uriStr, status: "error", type: type)
      }
    }
    task.resume()

    resolve("{\"id\":\"\(id)\",\"uri\":\"\(uriStr)\",\"status\":\"downloading\"}")
  }

  @objc func removeDownload(_ id: String,
                              resolve: @escaping RCTPromiseResolveBlock,
                              reject: @escaping RCTPromiseRejectBlock) {
    var arr = readIndex()
    var uriToDelete: String? = nil
    arr = arr.filter { e in
      if e["id"] as? String == id {
        uriToDelete = e["uri"] as? String
        return false
      }
      return true
    }
    writeIndex(arr)
    if let uri = uriToDelete {
      let dest = fileURL(for: id, uri: uri)
      try? FileManager.default.removeItem(at: dest)
    } else {
      // No uri known: best-effort delete any file matching id prefix
      let files = (try? FileManager.default.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: nil)) ?? []
      for f in files where f.lastPathComponent.hasPrefix(id.replacingOccurrences(of: "/", with: "_")) {
        try? FileManager.default.removeItem(at: f)
      }
    }
    // Cancel any in-flight HLS task for this id
    hlsTasks[id]?.cancel()
    hlsTasks.removeValue(forKey: id)
    resolve("{\"id\":\"\(id)\",\"status\":\"removed\"}")
  }

  @objc func getDownloads(_ resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
    let arr = readIndex()
    // Enrich bytesDownloaded from file size if status==done
    let enriched: [[String: Any]] = arr.map { e in
      var m = e
      if let id = e["id"] as? String, let uri = e["uri"] as? String, (e["status"] as? String) == "done" {
        // Prefer the recorded `localUri`. Re-deriving the path from `uri` is
        // wrong for HLS — the source is a `.m3u8` while the file on disk is a
        // media bundle — so this used to stat a path that does not exist and
        // report 0 bytes for a completed download.
        let dest: URL? = (e["localUri"] as? String).flatMap(URL.init(string:)) ?? fileURL(for: id, uri: uri)
        if let dest = dest,
           let attrs = try? FileManager.default.attributesOfItem(atPath: dest.path),
           let size = attrs[.size] as? Int64 {
          m["bytesDownloaded"] = size
          m["bytesTotal"] = size
        }
        // A `localUri` whose file has since been removed must not be handed to
        // the player: `resolveUri` would return a path that 404s, instead of
        // falling back to the source URL.
        if let d = dest, !FileManager.default.fileExists(atPath: d.path) {
          m.removeValue(forKey: "localUri")
        }
      }
      return m
    }
    let data = (try? JSONSerialization.data(withJSONObject: enriched)) ?? Data("[]".utf8)
    resolve(String(data: data, encoding: .utf8) ?? "[]")
  }

  @objc func clearCache(_ resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    URLCache.shared.removeAllCachedResponses()
    let files = (try? FileManager.default.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: nil)) ?? []
    for f in files { try? FileManager.default.removeItem(at: f) }
    // Cancel all in-flight HLS tasks
    hlsTasks.values.forEach { $0.cancel() }
    hlsTasks.removeAll()
    writeIndex([])
    resolve("{}")
  }

  @objc func getCacheSize(_ resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
    var total: Int64 = 0
    if let files = try? FileManager.default.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: [.fileSizeKey]) {
      for f in files {
        if let vals = try? f.resourceValues(forKeys: [.fileSizeKey]), let sz = vals.fileSize {
          total += Int64(sz)
        }
      }
    }
    // Include URLCache disk usage approximation (cached responses)
    total += Int64(URLCache.shared.currentDiskUsage)
    resolve("\(total)")
  }

  // No `addListener` / `removeListeners`: this module never emits an event.
  // They used to be declared as empty `@objc` stubs purely to satisfy a spec
  // that asked for them, which meant the TurboModule spec and the class
  // disagreed about what this module is. Both now agree. See to-be-done.md
  // FG-3.1 and the matching removal from `src/specs/NativeObsidianCache.ts`.
}

// MARK: - TurboModule registration
//
// Declared in `ios/ObsidianMediaPlayerModules.mm`, not here: the generated
// `NativeObsidianCacheSpec` protocol inherits `RCTTurboModule`, whose
// `getTurboModule:` returns a C++ `std::shared_ptr` and therefore cannot be
// conformed to from Swift. See to-be-done.md FG-3.1.
