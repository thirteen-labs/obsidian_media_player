require "json"

# RN's own pod helpers. `install_modules_dependencies` is the supported way for a
# library to declare its React Native dependencies: it emits the correct set for
# the installed RN version, the right Folly version, and the header search paths
# that go with them. Hand-rolling the list (which this podspec did, with
# `s.dependency "React-RCTFabric"`) is what broke `pod lib lint` — see below.
#
# Resolved through node rather than a hardcoded "../node_modules/react-native"
# on purpose: react-native is a *sibling* of this library in a consuming app, not
# a child of it, so the relative path only works when the module happens to be
# linked from its own checkout. This is the same resolution the RN library
# template uses.
_rn_pkg = `node --print "require.resolve('react-native/package.json')" 2>/dev/null`.strip
if _rn_pkg.empty?
  raise <<~MESSAGE
    Could not resolve react-native to load its CocoaPods helpers.

    `node` must be on PATH when `pod install` / `pod lib lint` runs — the podspec
    resolves react-native by asking node for it, and node could not answer.

    Check that:
      * node is installed and on PATH (try: node --version)
      * dependencies are installed (try: npm install)
    See to-be-done.md FG-3.1.
  MESSAGE
end
require File.join(File.dirname(_rn_pkg), "scripts", "react_native_pods")

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
  s.description  = package["description"]
  # `summary` is a separate, short field: `pod lib lint` warns when it is the
  # full description ("The summary should be a short version of `description`
  # (max 140 characters)"), and it is what shows in search results. It was
  # reading `description` wholesale, so it warned on every lint run.
  s.summary      = "React Native video, audio and music playback with playlists, background playback and caching."
  # Read from package.json rather than written down, so it cannot drift into an
  # unreachable URL again. It previously pointed at github.com/obsidian/, which
  # `pod lib lint` flagged: "The URL ... is not reachable". Normalised to the
  # git URL (dropping a trailing `.git`) because that is what a browser wants;
  # `s.source` below keeps the .git form CocoaPods uses for cloning.
  s.homepage     = package["repository"]["url"].sub(/\.git$/, "")
  s.license      = package["license"]
  s.authors      = { "Obsidian" => "oss@obsidian.dev" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => package["repository"]["url"], :tag => "#{s.version}" }
  s.swift_version = "5.0"

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.requires_arc = true

  # Declares React-Core, React-RCTFabric, React-Codegen, RCT-Folly, glog, Yoga,
  # React-jsi and the rest, at the versions this RN ships, plus the matching
  # header search paths.
  #
  # This replaces three hand-written `s.dependency` lines, one of which was
  # `React-RCTFabric` — and *that* is what made `pod lib lint` fail:
  #
  #   ERROR | [iOS] unknown: Encountered an unknown error (Unable to find a
  #   specification for `React-RCTFabric` depended upon by `ObsidianMediaPlayer`)
  #
  # `React-RCTFabric` is a **local** pod: its podspec ships inside the
  # react-native npm package (node_modules/react-native/React/React-RCTFabric.
  # podspec) and it does not exist on the CocoaPods trunk — the trunk API returns
  # 404 for it. `pod lib lint` resolves dependencies from the trunk, so it can
  # never satisfy it, however the podspec is written.
  #
  # The dependency is genuine and must not be dropped:
  # ios/ObsidianMediaPlayerModules.mm imports
  # `<React/RCTLegacyViewManagerInteropComponentView.h>`, which is what lets
  # <ObsidianVideo> (a Paper RCTViewManager) mount through Fabric's interop
  # layer. See to-be-done.md FG-3.1 and FG-3.3.
  #
  # So resolution happens at lint time instead: scripts/ci/verify-ios-pod.mjs
  # passes `--include-podspecs` for the local RN podspecs, which is the
  # CocoaPods-supported way to lint a pod whose dependencies are development
  # pods. `React-Codegen` remains reachable the same way — note the name, it is
  # `React-Codegen`, not `ReactCodegen`; the old spelling made every
  # `pod install` fail with "Unable to find a specification for ReactCodegen".
  install_modules_dependencies(s, new_arch_enabled: fabric_enabled)

  # The flag every `#if RCT_NEW_ARCH_ENABLED` block in this pod tests. Set
  # explicitly rather than left to install_modules_dependencies, which derives
  # its own from ENV: the `raise` at the top of this file means the pod refuses
  # to evaluate at all unless the flag is on, so the two must be stated in the
  # same place or they can silently disagree.
  s.compiler_flags = "-DRCT_NEW_ARCH_ENABLED=1"

  # install_modules_dependencies sets HEADER_SEARCH_PATHS (boost, Yoga, and the
  # React private/public header dirs) and CLANG_CXX_LANGUAGE_STANDARD, merging
  # them into whatever is declared here. The bridging header is ours alone: the
  # Swift files get RCTEventEmitter / RCTViewManager solely through it, so a pod
  # rename would otherwise break them silently. FG-3.2 step 4.
  #
  # Deliberately not depending on `React-RCTAppDelegate` (an app-target pod; a
  # library depending on it is backwards). Removed in FG-3.2.
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    # Set explicitly rather than relying on Xcode's `<Target>-Bridging-Header.h`
    # name convention: the Swift files get RCTEventEmitter / RCTViewManager
    # solely from this header, so a pod rename would otherwise break them
    # silently. See to-be-done.md FG-3.2 step 4.
    "SWIFT_OBJC_BRIDGING_HEADER" => "$(PODS_TARGET_SRCROOT)/ios/ObsidianMediaPlayer-Bridging-Header.h",
  }
end
