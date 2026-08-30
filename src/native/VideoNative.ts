import ObsidianVideo, {
  Commands,
  NativeProps,
} from '../specs/NativeObsidianVideo';

/**
 * The <ObsidianVideo> native component. `codegenNativeComponent` already
 * abstracts the New Architecture (Fabric) vs legacy (Paper) view managers,
 * so no runtime switch is required here.
 */
export { Commands };
export type { NativeProps };
export default ObsidianVideo;
