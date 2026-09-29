const { withInfoPlist, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin for obsidian-media-player.
 * - iOS: adds UIBackgroundModes: audio so background playback + lock-screen works.
 * - Android: ensures FOREGROUND_SERVICE + mediaPlayback service is declared
 *   (already in the library manifest, but this is a no-op safety net for
 *   bare prebuilds).
 *
 * Usage (app.json):
 *   { "plugins": [["obsidian-media-player/plugin", { "backgroundAudio": true }]] }
 */
function withObsidian(config, props = {}) {
  const { backgroundAudio = true } = props;

  config = withInfoPlist(config, cfg => {
    if (!backgroundAudio) return cfg;
    cfg.modResults.UIBackgroundModes = Array.from(
      new Set([...(cfg.modResults.UIBackgroundModes || []), 'audio'])
    );
    return cfg;
  });

  config = withAndroidManifest(config, cfg => {
    if (!backgroundAudio) return cfg;
    const manifest = cfg.modResults.manifest;
    // Deliberately a no-op. The library manifest already declares
    // FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK and the
    // ObsidianPlaybackService with foregroundServiceType="mediaPlayback", and
    // the Android manifest merger propagates all of them into the app. Writing
    // them here as well would only create a second source of truth that can
    // drift from the library.
    //
    // Do not "fix" this by adding permissions here — add them to
    // android/src/main/AndroidManifest.xml instead. See to-be-done.md FG-0.1.
    return cfg;
  });

  return config;
}

module.exports = withObsidian;
module.exports.default = withObsidian;
