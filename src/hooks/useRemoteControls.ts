import { useEffect } from 'react';
import { NativeEventEmitter } from 'react-native';
import MusicPlayerNative from '../native/MusicPlayerNative';
import { MUSIC_EVENTS } from '../core/Events';

export type RemoteCommand =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'seek'
  | 'duck';

/**
 * Subscribes to remote-control commands originating from the OS lock screen,
 * headset buttons or car/ Wear OS. The callback receives the command plus an
 * optional payload (e.g. `{ position }` for seek, `{ ducked }` for duck).
 */
export function useRemoteControls(
  onCommand: (command: RemoteCommand, payload?: Record<string, unknown>) => void
): void {
  useEffect(() => {
    const emitter = new NativeEventEmitter(MusicPlayerNative as any);
    const sub = emitter.addListener(MUSIC_EVENTS.REMOTE_COMMAND, (e: any) => {
      onCommand((e?.command as RemoteCommand) ?? 'play', e?.payload);
    });
    MusicPlayerNative.addListener(MUSIC_EVENTS.REMOTE_COMMAND);
    return () => {
      sub.remove();
      MusicPlayerNative.removeListeners(1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
