import { TurboModule, TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // No addListener / removeListeners: ObsidianCache never emits an event. They
  // were declared here and stubbed as empty `@objc` methods in
  // `ios/Cache/ObsidianCacheModule.swift` purely to satisfy the spec, which
  // left the spec and the class disagreeing about what the module is. The
  // generator emits whatever is written here, so declaring them produced two
  // no-op methods on both sides. See to-be-done.md FG-3.1.
  download: (id: string, sourceJson: string) => Promise<string>;
  removeDownload: (id: string) => Promise<string>;
  getDownloads: () => Promise<string>;
  clearCache: () => Promise<string>;
  getCacheSize: () => Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ObsidianCache');
