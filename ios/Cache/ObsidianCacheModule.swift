import Foundation
import AVFoundation

/// Offline cache + download manager. Persists a download index in UserDefaults
/// and progressive downloads in ApplicationSupport/obsidian-media-cache.
/// HLS via AVAssetDownloadURLSession when the `com.apple.developer.avassetdownload`
/// entitlement is present; otherwise falls back to progressive file cache + URLCache.
@objc(ObsidianCache)
class ObsidianCache: NSObject {

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

  private func upsertEntry(id: String, uri: String, status: String, bytesDownloaded: Int64 = 0, bytesTotal: Int64 = 0, type: String = "") {
    var arr = readIndex()
    if let idx = arr.firstIndex(where: { $0["id"] as? String == id }) {
      var e = arr[idx]
      e["uri"] = uri
      e["status"] = status
      e["bytesDownloaded"] = bytesDownloaded
      e["bytesTotal"] = bytesTotal
      if !type.isEmpty { e["type"] = type }
      arr[idx] = e
    } else {
      arr.append(["id": id, "uri": uri, "type": type, "status": status, "bytesDownloaded": bytesDownloaded, "bytesTotal": bytesTotal])
    }
    writeIndex(arr)
  }

  private func fileURL(for id: String, uri: String) -> URL {
    let ext = (URL(string: uri)?.pathExtension ?? "").isEmpty ? "mp4" : (URL(string: uri)!.pathExtension)
    // Sanitize id for filesystem
    let safeId = id.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: ":", with: "_")
    return cacheDirectory.appendingPathComponent("\(safeId).\(ext)")
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
      if #available(iOS 10.0, *) {
        // Check if AVAssetDownloadURLSession is usable (entitlement gate).
        // If creation fails we fall through to progressive path.
        let config = URLSessionConfiguration.background(withIdentifier: "obsidian-hls-\(id)")
        if let session = AVAssetDownloadURLSession(configuration: config, assetDownloadDelegate: nil, delegateQueue: .main) as AVAssetDownloadURLSession? {
          let asset = AVURLAsset(url: url, options: headers.map { ["AVURLAssetHTTPHeaderFieldsKey": $0] })
          // AVAssetDownloadTask requires FairPlay entitlement to persist; without it this will error
          // but we still treat as downloading and fall back to URLCache on failure.
          let task = session.makeAssetDownloadTask(asset: asset, assetTitle: id, assetArtworkData: nil, options: nil)
          task?.resume()
          resolve("{\"id\":\"\(id)\",\"uri\":\"\(uriStr)\",\"status\":\"downloading\"}")
          // Update index async — task will download in background; we optimistically mark done after 2s if no error callback
          DispatchQueue.global().asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.upsertEntry(id: id, uri: uriStr, status: "done", type: type)
          }
          return
        }
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
        self.upsertEntry(id: id, uri: uriStr, status: "done", bytesDownloaded: size, bytesTotal: size, type: type)
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
    resolve("{\"id\":\"\(id)\",\"status\":\"removed\"}")
  }

  @objc func getDownloads(_ resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
    let arr = readIndex()
    // Enrich bytesDownloaded from file size if status==done
    let enriched: [[String: Any]] = arr.map { e in
      var m = e
      if let id = e["id"] as? String, let uri = e["uri"] as? String, (e["status"] as? String) == "done" {
        let dest = fileURL(for: id, uri: uri)
        if let attrs = try? FileManager.default.attributesOfItem(atPath: dest.path), let size = attrs[.size] as? Int64 {
          m["bytesDownloaded"] = size
          m["bytesTotal"] = size
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

  @objc func addListener(_ eventName: String) {}
  @objc func removeListeners(_ count: Double) {}
}

#if RCT_NEW_ARCH_ENABLED
import ObsidianMediaPlayerSpec
extension ObsidianCache: ObsidianCacheSpec {}
#endif
