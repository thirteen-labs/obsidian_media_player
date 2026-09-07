import ObsidianVideo, {
  Commands as VideoViewCommands,
  NativeProps,
} from '../specs/NativeObsidianVideo';

/**
 * The <ObsidianVideo> native component. `codegenNativeComponent` already
 * abstracts the New Architecture (Fabric) vs legacy (Paper) view managers,
 * so no runtime switch is required here.
 *
 * NOTE: Do not re-export the spec's `Commands` identifier under its original
 * name. `@react-native/babel-plugin-codegen` treats any `export {... Commands ...}`
 * (local name `Commands`) in ANY bundled file as a reserved codegen export
 * and fails release bundling with:
 * "'Commands' is a reserved export and may only be used to export the result
 *  of codegenNativeCommands."
 * Hence we alias it to `VideoCommands` at the boundary.
 */
export { VideoViewCommands as VideoCommands };
export type { NativeProps };
export default ObsidianVideo;
