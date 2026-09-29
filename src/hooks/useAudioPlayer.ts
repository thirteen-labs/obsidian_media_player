import { useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { DownloadManager } from '../core/DownloadManager';
import AudioNative from '../native/AudioNative';
import { AUDIO_EVENTS } from '../core/Events';
import { INITIAL_STATE, parseState, sourceToJson } from '../utils/media';
import type { AudioControls, MediaSource, PlaybackState } from '../types';

// Re-exported so existing `from './hooks/useAudioPlayer'` imports keep working.
// The definition lives in `types.ts` so the web build can share it — see
// to-be-done.md FG-2.1.
export type { AudioControls };

export function useAudioPlayer(initial?: MediaSource): {
  state: PlaybackState;
  controls: AudioControls;
} {
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
  const emitterRef = useRef<NativeEventEmitter | null>(null);

  useEffect(() => {
    const emitter = new NativeEventEmitter(AudioNative as any);
    emitterRef.current = emitter;

    const onState = (e: any) => {
      const parsed = parseState(e?.stateJson);
      if (parsed) setState(parsed);
    };
    const onProgress = (e: any) => {
      setState((prev) => ({ ...prev, position: e?.position ?? prev.position, duration: e?.duration ?? prev.duration }));
    };
    const onEnded = () => setState((prev) => ({ ...prev, status: 'ended', position: prev.duration }));
    const onError = (e: any) => setState((prev) => ({ ...prev, status: 'error', error: e?.message }));

    // Single source of truth for which events this hook handles, matching
    // `useMusicPlayer`. See to-be-done.md FG-1.4.
    const subscriptions: Array<[string, (e: any) => void]> = [
      [AUDIO_EVENTS.STATE, onState],
      [AUDIO_EVENTS.PROGRESS, onProgress],
      [AUDIO_EVENTS.ENDED, onEnded],
      [AUDIO_EVENTS.ERROR, onError],
    ];

    // The manual `addListener` / `removeListeners` calls this used to make are
    // gone: constructed with the native module, `NativeEventEmitter` already
    // forwards both (`NativeEventEmitter.js:80,90`). Calling them by hand
    // double-counted every subscription.
    const subs = subscriptions.map(([name, handler]) =>
      emitter.addListener(name, handler)
    );

    return () => {
      subs.forEach((s) => s.remove());
      emitterRef.current = null;
    };
  }, []);

  const controls = useRef<AudioControls>({
    load: async (source) => {
      // Resolve the source URI to a local cached copy if available, so the
      // native player can play offline content.
      //
      // Looked up by URI, not by id: `<Audio>` is handed a `MediaSource` and has
      // no id. Passing the URI to `resolveUri(id)` matched it against
      // `DownloadInfo.id`, so it could never match and this was a no-op.
      //
      // `cacheable: false` skips the lookup — see the note in
      // `useMusicPlayer.setQueue`.
      const cachedUri =
        source.cacheable === false
          ? null
          : await DownloadManager.resolveUriForUri(source.uri);
      const effectiveUri = cachedUri || source.uri;
      AudioNative.load(sourceToJson({ ...source, uri: effectiveUri }));
    },
    play: () => AudioNative.play(),
    pause: () => AudioNative.pause(),
    stop: () => AudioNative.stop(),
    seek: (seconds) => AudioNative.seek(seconds),
    setRate: (rate) => AudioNative.setRate(rate),
    setVolume: (volume) => AudioNative.setVolume(volume),
    setMuted: (muted) => AudioNative.setMuted(muted),
    setLoop: (loop) => AudioNative.setLoop(loop),
    getState: async () => parseState(await AudioNative.getCurrentState()),
  });

  useEffect(() => {
    if (initial) AudioNative.load(sourceToJson(initial));
    // Mount-only: `initial` seeds the native player once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, controls: controls.current };
}
