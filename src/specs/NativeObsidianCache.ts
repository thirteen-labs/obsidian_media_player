import { TurboModule, TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;

  download: (id: string, sourceJson: string) => Promise<string>;
  removeDownload: (id: string) => Promise<string>;
  getDownloads: () => Promise<string>;
  clearCache: () => Promise<string>;
  getCacheSize: () => Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ObsidianCache');
