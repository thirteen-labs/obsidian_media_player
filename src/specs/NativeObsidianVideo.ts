import * as React from 'react';
import type { HostComponent, ViewProps } from 'react-native';
import type {
  Double,
  WithDefault,
  DirectEventHandler,
} from 'react-native/Libraries/Types/CodegenTypes';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
import codegenNativeCommands from 'react-native/Libraries/Utilities/codegenNativeCommands';

export type ResizeModeType = 'contain' | 'cover' | 'stretch' | 'none';

export type StateEvent = Readonly<{ stateJson: string }>;
export type ProgressEvent = Readonly<{
  position: Double;
  duration: Double;
}>;
export type ErrorEvent = Readonly<{ message: string }>;
export type BufferingEvent = Readonly<{ buffered: Double }>;

export interface NativeProps extends ViewProps {
  /** JSON-encoded MediaSource. */
  sourceJson?: string;
  paused?: WithDefault<boolean, false>;
  muted?: WithDefault<boolean, false>;
  volume?: WithDefault<Double, 1.0>;
  rate?: WithDefault<Double, 1.0>;
  resizeMode?: WithDefault<string, 'contain'>;
  repeat?: WithDefault<boolean, false>;

  onStateChange?: DirectEventHandler<StateEvent>;
  onProgress?: DirectEventHandler<ProgressEvent>;
  onBuffering?: DirectEventHandler<BufferingEvent>;
  onEnded?: DirectEventHandler<null>;
  onError?: DirectEventHandler<ErrorEvent>;
}

/**
 * Command names are NOT free-form: see the naming rule below.
 *
 * ---------------------------------------------------------------------------
 * Why these four are `apply*` and not `set*`
 * ---------------------------------------------------------------------------
 * `GeneratePropsJavaInterface.js` emits, into a single interface:
 *
 *   props    ->  `void set<PascalCase(propName)>(T view, <type> value);`
 *   commands ->  `void <commandName>(T view, <argTypes...>);`
 *
 * and it concatenates the two lists with no de-duplication (see
 * `generatePropsString` / `generateCommandsString`, then
 * `[propsString, commandsString].join(...)`). So a command named `setRate`
 * collides with the prop `rate` and javac rejects the interface with
 * "method setRate(T,double) is already defined" — in the *consuming app's*
 * `compileReleaseJavaWithJavac`, because the generated interface lands in the
 * app's codegen source set, not in this package.
 *
 * All four of `rate`, `volume`, `muted` and `resizeMode` exist as BOTH a prop
 * and a command, so all four collided and the Android build died at
 * compileReleaseJavaWithJavac. `play`/`pause`/`stop`/`seek` never collided
 * only because no prop is named `play`, `pause`, `stop` or `seek` — they are
 * safe by coincidence, not by design.
 *
 * THE RULE: no command may be named `set` + PascalCase of any prop name, now or
 * in future. `apply*` satisfies it — `applyRate` can only collide with a prop
 * literally named `applyRate`, whose setter would be `setApplyRate`.
 *
 * `scripts/verify-codegen-commands.mjs` regenerates the Android artifacts and
 * fails on any duplicate signature, so this cannot regress silently again.
 */
export interface NativeCommands {
  play: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
  pause: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
  stop: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
  seek: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    seconds: Double,
  ) => void;
  applyRate: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    rate: Double,
  ) => void;
  applyVolume: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    volume: Double,
  ) => void;
  applyMuted: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    muted: boolean,
  ) => void;
  applyResizeMode: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    mode: string,
  ) => void;
}

export const Commands = codegenNativeCommands<NativeCommands>({
  supportedCommands: [
    'play',
    'pause',
    'stop',
    'seek',
    'applyRate',
    'applyVolume',
    'applyMuted',
    'applyResizeMode',
  ],
});

export default codegenNativeComponent<NativeProps>(
  'ObsidianVideo',
) as HostComponent<NativeProps>;
