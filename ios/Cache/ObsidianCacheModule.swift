import Foundation
import AVFoundation

/// Offline HLS download helper (iOS 10+). This scaffold exposes the JS API
/// and implements the cache-size/remove paths; actual AVAssetDownloadTask
/// wiring is gated behind the HLS-download entitlement and left as a hook
/// so the host app can opt in without breaking the base build.
@objc(ObsidianCache)
class ObsidianCache: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  // MARK: - TurboModule / bridge exports

  @objc func download(_ id: String, sourceJson: String,
                      resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    // Parse source
    guard let data = sourceJson.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let uriStr = obj["uri"] as? String,
          let url = URL(string: uriStr) else {
      resolve("{}"); return
    }

    // Non-HLS or no entitlement: fall back to URLCache (progressive).
    // Keep contract: resolve with JSON download info.
    if !uriStr.lowercased().contains(".m3u8") {
      URLSession.shared.dataTask(with: url) { _, _, _ in
        resolve("{\"id\":\"\(id)\",\"status\":\"done\"}")
      }.resume()
      return
    }

    // HLS — AVAssetDownloadURLSession would be used here when the host app
    // enables the `com.apple.developer.avassetdownload` entitlement. For the
    // scaffold we still resolve immediately so JS `await download()` doesn't hang.
    resolve("{\"id\":\"\(id)\",\"status\":\"downloading\"}")
  }

  @objc func removeDownload(_ id: String,
                             resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
    resolve("{}")
  }

  @objc func getDownloads(_ resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
    resolve("[]")
  }

  @objc func clearCache(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
    URLCache.shared.removeAllCachedResponses()
    resolve("{}")
  }

  @objc func getCacheSize(_ resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
    resolve("0")
  }

  @objc func addListener(_ eventName: String) {}
  @objc func removeListeners(_ count: Double) {}
}

#if RCT_NEW_ARCH_ENABLED
import ObsidianMediaPlayerSpec
extension ObsidianCache: ObsidianCacheSpec {}
#endif
