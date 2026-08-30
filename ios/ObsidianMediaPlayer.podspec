require "json"

package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

fabric_enabled = ENV["RCT_NEW_ARCH_ENABLED"] == "1"

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

  if fabric_enabled
    # Generated TurboModule / Fabric interfaces produced by RN Codegen.
    s.dependency "ReactCodegen"
    s.dependency "RCT-Folly"
    s.dependency "React-RCTAppDelegate"
    s.compiler_flags = "-DRCT_NEW_ARCH_ENABLED=1"
    s.pod_target_xcconfig = {
      "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
      "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\""
    }
  end
end
