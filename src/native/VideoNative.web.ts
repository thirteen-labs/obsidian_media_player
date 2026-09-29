import * as React from 'react';
import { notOnWeb } from './notOnWeb';

/**
 * Web stub for the `ObsidianVideo` Fabric component and its commands.
 *
 * The native module is imported *for real* (not as a type) by
 * `VideoNative.ts`, and the codegen spec calls `codegenNativeComponent` at
 * module scope. That pulls in
 * `react-native/Libraries/Utilities/codegenNativeComponent`, a path that does
 * not exist in react-native-web — so this was a **bundle-time module
 * resolution failure**, not a runtime error. No amount of guarding inside the
 * native file could fix it; the import graph itself had to change.
 *
 * The web build renders a real HTML5 `<video>` via `components/Video.web.tsx`,
 * which never touches this module. This file exists only so that
 * `src/index.ts` can keep exporting `ObsidianVideoNative` and `VideoCommands`
 * on web without dragging in codegen.
 *
 * The component renders `null` rather than throwing: rendering it is a no-op,
 * whereas *calling a command* is a genuine mistake worth reporting.
 */
const ObsidianVideo = React.forwardRef(function ObsidianVideoWebStub(
  _props: Record<string, unknown>,
  _ref: React.Ref<unknown>
) {
  return null;
});
ObsidianVideo.displayName = 'ObsidianVideo(web stub)';

const unavailable = (name: string) => () => {
  throw notOnWeb(`VideoCommands.${name}`);
};

export const Commands = {
  play: unavailable('play'),
  pause: unavailable('pause'),
  stop: unavailable('stop'),
  seek: unavailable('seek'),
  setRate: unavailable('setRate'),
  setVolume: unavailable('setVolume'),
  setMuted: unavailable('setMuted'),
  setResizeMode: unavailable('setResizeMode'),
};

/**
 * Aliased at the boundary, exactly as the native `VideoNative.ts` does.
 *
 * `@react-native/babel-plugin-codegen` treats any `export { ... Commands ... }`
 * in *any* bundled file as a reserved codegen export and fails release bundling
 * with "'Commands' is a reserved export…". The native file has the same
 * comment; it applies here too.
 */
export { Commands as VideoCommands };

export default ObsidianVideo;
