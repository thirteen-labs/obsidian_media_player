import type { ViewProps } from 'react-native';
import type {
  Double,
  WithDefault,
  DirectEventHandler,
  Int32,
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
  onVideoReady?: DirectEventHandler<Readonly<{ width: Int32; height: Int32 }>>;
}

export interface NativeCommands {
  play: (viewRef: unknown) => void;
  pause: (viewRef: unknown) => void;
  stop: (viewRef: unknown) => void;
  seek: (viewRef: unknown, seconds: Double) => void;
  setRate: (viewRef: unknown, rate: Double) => void;
  setVolume: (viewRef: unknown, volume: Double) => void;
  setMuted: (viewRef: unknown, muted: boolean) => void;
  setResizeMode: (viewRef: unknown, mode: string) => void;
}

export const Commands = codegenNativeCommands<NativeCommands>({
  supportedCommands: [
    'play',
    'pause',
    'stop',
    'seek',
    'setRate',
    'setVolume',
    'setMuted',
    'setResizeMode',
  ],
});

export default codegenNativeComponent<NativeProps>('ObsidianVideo');
