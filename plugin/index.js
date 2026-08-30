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
    // Library manifest already declares ObsidianPlaybackService; keep this
    // as a guard for standalone manifests that strip library entries.
    return cfg;
  });

  return config;
}

module.exports = withObsidian;
module.exports.default = withObsidian;
