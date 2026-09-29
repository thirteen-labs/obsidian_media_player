import { TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * iOS requires the New Architecture (to-be-done.md D1), so there is no legacy
 * `NativeModules` path to fall back to and no reason to pretend there is.
 *
 * The old shape — `if (__turboModuleProxy) return spec; else return
 * NativeModules.X` — existed to paper over the Old Architecture. Under it,
 * `NativeModules.ObsidianAudio` was `undefined` on iOS (nothing called
 * `RCT_EXPORT_MODULE`), so the *import* of this file threw and took the whole
 * app down with a message that said only "not linked". The genuine cause was
 * almost always the architecture flag, and the message never said so.
 *
 * `TurboModuleRegistry.get` is the right call rather than `getEnforcing`: it
 * consults `NativeModules` first when not bridgeless, then the TurboModule
 * proxy, which covers both the New Architecture on iOS and Android's
 * `BaseReactPackage` path. It returns `null` instead of throwing, so we can
 * raise an error that names the actual fix.
 */
export function requireTurboModule<T extends TurboModule>(name: string): T {
  const mod = TurboModuleRegistry.get<T>(name);
  if (mod) {
    return mod;
  }

  throw new Error(
    `[obsidian-media-player] Native module "${name}" is not registered.\n\n` +
      'On iOS this package requires the New Architecture. Set\n' +
      '  RCT_NEW_ARCH_ENABLED=1\n' +
      'in the environment that runs `pod install`, then reinstall pods and\n' +
      'rebuild the app. If it is already set, re-run `pod install` and rebuild.\n' +
      'On Android, rebuild the app — autolinking registers the module at\n' +
      'build time, so a JS-only reload cannot add it.'
  );
}

export default requireTurboModule;
