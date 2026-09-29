/**
 * Global test setup.
 *
 * `src/native/*Native.ts` resolve the native module at *import* time and
 * throw a helpful "not linked" error when it is missing, so the modules have to
 * be in place before any test file is loaded. `setupFiles` (not
 * `setupFilesAfterEach`) is what makes that possible.
 *
 * The mock records every `addListener` / `removeListeners` call so tests can
 * assert the subscription bookkeeping — which is where FG-1.4 lived.
 */
const { NativeModules } = require('react-native');

/** Builds a native module mock that satisfies NativeEventEmitter. */
function createNativeModuleMock(name) {
  const mod = {
    __name: name,
    __listenerCalls: [],

    // NativeEventEmitter calls these to bracket subscriptions. Under the New
    // Architecture the counts must balance or it throws an Invariant.
    addListener(eventName) {
      mod.__listenerCalls.push(['add', eventName]);
    },
    removeListeners(count) {
      mod.__listenerCalls.push(['remove', count]);
    },
  };

  // Playback + queue methods, all jest.fn() so tests can assert delegation.
  [
    'load',
    'play',
    'pause',
    'stop',
    'seek',
    'setRate',
    'setVolume',
    'setMuted',
    'setLoop',
    'setQueue',
    'addTracks',
    'removeTrack',
    'skipTo',
    'next',
    'previous',
    'setRepeatMode',
    'setShuffle',
    'setRemoteControls',
    'setBackgroundEnabled',
  ].forEach((method) => {
    mod[method] = jest.fn();
  });

  mod.getCurrentState = jest.fn(async () => null);
  mod.getCurrentQueue = jest.fn(async () => null);

  // Cache module surface (see src/specs/NativeObsidianCache.ts). `download` is
  // load-bearing beyond delegation: `DownloadManager.hasNativeCache()` gates on
  // `typeof CacheNative.download === 'function'`, so without it here *every*
  // native cache path silently reports "not available" and the FG-5.1 lookups
  // could only be tested by mocking the resolver itself — which is how a dead
  // `resolveUri(source.uri)` call survived in the first place.
  mod.download = jest.fn(async () => '{}');
  mod.prefetchToCache = jest.fn(async () => '{}');
  mod.getDownloads = jest.fn(async () => '[]');
  mod.getCacheSize = jest.fn(async () => '0');
  mod.clearCache = jest.fn(async () => '{}');
  mod.removeDownload = jest.fn(async () => '{}');

  return mod;
}

const music = createNativeModuleMock('ObsidianMusicPlayer');
const audio = createNativeModuleMock('ObsidianAudio');
const cache = createNativeModuleMock('ObsidianCache');

NativeModules.ObsidianMusicPlayer = music;
NativeModules.ObsidianAudio = audio;
NativeModules.ObsidianCache = cache;

// Exposed for tests that need to emit events or inspect the mocks.
global.__ompNativeMocks = { music, audio, cache };
