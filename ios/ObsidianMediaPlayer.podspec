require "json"

package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

fabric_enabled = ENV["RCT_NEW_ARCH_ENABLED"] == "1"

# iOS requires the New Architecture (to-be-done.md D1). Failing here — at
# `pod install` — is far kinder than letting the install succeed and the build
# die later inside generated headers or at runtime with `NativeModules.X` being
# undefined, which is the failure mode this podspec had.
unless fabric_enabled
  raise <<~MESSAGE
    obsidian-media-player requires the New Architecture on iOS.

    Set RCT_NEW_ARCH_ENABLED=1 in the environment that runs `pod install`:

        RCT_NEW_ARCH_ENABLED=1 pod install

    then rebuild the app. See to-be-done.md D1 and FG-3.1.
  MESSAGE
end

Pod::Spec.new do |s|
  s.name         = "ObsidianMediaPlayer"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/obsidian/obsidian-media-player"
  s.license      = package["license"]
  s.authors      = { "Obsidian" => "oss@obsidian.dev" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => package["repository"]["url"], :tag => "#{s.version}" }
  s.swift_version = "5.0"

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.requires_arc = true

  s.dependency "React-Core"

  # Provides the generated `ObsidianMediaPlayerSpec` protocols that
  # `ios/ObsidianMediaPlayerModules.mm` conforms to. Note the name: the pod is
  # `React-Codegen`, not `ReactCodegen`. The old spelling made every
  # `pod install` fail with "Unable to find a specification for ReactCodegen".
  s.dependency "React-Codegen"

  # Provides `RCTLegacyViewManagerInteropComponentView`, which <ObsidianVideo>
  # renders through — it is a Paper `RCTViewManager` mounted by Fabric's
  # interop layer. Declaring it is what puts the header on the search path for
  # the `+load` allowlist opt-in. See to-be-done.md FG-3.1 and FG-3.3.
  s.dependency "React-RCTFabric"

  # The flag every `#if RCT_NEW_ARCH_ENABLED` block in this pod tests.
  s.compiler_flags = "-DRCT_NEW_ARCH_ENABLED=1"

  # Deliberately not depending on `RCT-Folly` (a vendored pod the app already
  # sources — depending on it from a library risks a duplicate or mismatched
  # copy) nor on `React-RCTAppDelegate` (an app-target pod; a library
  # depending on it is backwards). Both were removed in FG-3.2.
  #
  # The old `HEADER_SEARCH_PATHS => "$(PODS_ROOT)/boost"` was Folly's layout
  # and went with the Folly dependency. `React-Codegen` and `React-RCTFabric`
  # add their own search paths, inherited via `$(inherited)`.
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    # Set explicitly rather than relying on Xcode's `<Target>-Bridging-Header.h`
    # name convention: the Swift files get RCTEventEmitter / RCTViewManager
    # solely from this header, so a pod rename would otherwise break them
    # silently. See to-be-done.md FG-3.2 step 4.
    "SWIFT_OBJC_BRIDGING_HEADER" => "$(PODS_TARGET_SRCROOT)/ios/ObsidianMediaPlayer-Bridging-Header.h",
  }
end
