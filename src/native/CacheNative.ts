import { NativeModules } from 'react-native';
import type { Spec } from '../specs/NativeObsidianCache';

function resolve(): Spec {
  const isNewArch = (global as any).__turboModuleProxy != null;
  if (isNewArch) return require('../specs/NativeObsidianCache').default as Spec;
  return (NativeModules as any).ObsidianCache as Spec;
}

const mod = resolve();
export default mod;
