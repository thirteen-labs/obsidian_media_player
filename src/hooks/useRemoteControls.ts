import { useEffect } from 'react';
import { NativeEventEmitter } from 'react-native';
import MusicPlayerNative from '../native/MusicPlayerNative';
import { MUSIC_EVENTS } from '../core/Events';
import type { RemoteCommand } from '../types';

// Re-exported so existing `from './hooks/useRemoteControls'` imports keep
// working. The definition lives in `types.ts` so the web build emits the same
// set. See to-be-done.md FG-2.3.
export type { RemoteCommand };

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
    // The manual `addListener` / `removeListeners` calls this used to make are
    // gone: constructed with the native module, `NativeEventEmitter` already
    // forwards both (`NativeEventEmitter.js:80,90`), so calling them by hand
    // double-counted the subscription. See to-be-done.md FG-1.4.
    return () => {
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
