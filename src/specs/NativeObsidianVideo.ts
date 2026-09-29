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

export interface NativeCommands {
  play: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
  pause: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
  stop: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
  seek: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    seconds: Double,
  ) => void;
  setRate: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    rate: Double,
  ) => void;
  setVolume: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    volume: Double,
  ) => void;
  setMuted: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    muted: boolean,
  ) => void;
  setResizeMode: (
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
    'setRate',
    'setVolume',
    'setMuted',
    'setResizeMode',
  ],
});

export default codegenNativeComponent<NativeProps>(
  'ObsidianVideo',
) as HostComponent<NativeProps>;
