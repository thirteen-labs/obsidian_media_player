import { useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import AudioNative from '../native/AudioNative';
import { AUDIO_EVENTS } from '../core/Events';
import { INITIAL_STATE, parseState, sourceToJson } from '../utils/media';
import type { MediaSource, PlaybackState } from '../types';

export interface AudioControls {
  load: (source: MediaSource) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setLoop: (loop: boolean) => void;
  getState: () => Promise<PlaybackState | null>;
}

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

    const subState = emitter.addListener(AUDIO_EVENTS.STATE, onState);
    const subProgress = emitter.addListener(AUDIO_EVENTS.PROGRESS, onProgress);
    const subEnded = emitter.addListener(AUDIO_EVENTS.ENDED, onEnded);
    const subError = emitter.addListener(AUDIO_EVENTS.ERROR, onError);

    AudioNative.addListener(AUDIO_EVENTS.STATE);
    AudioNative.addListener(AUDIO_EVENTS.PROGRESS);
    AudioNative.addListener(AUDIO_EVENTS.ENDED);
    AudioNative.addListener(AUDIO_EVENTS.ERROR);

    return () => {
      subState.remove();
      subProgress.remove();
      subEnded.remove();
      subError.remove();
      AudioNative.removeListeners(4);
      emitterRef.current = null;
    };
  }, []);

  const controls = useRef<AudioControls>({
    load: (source) => AudioNative.load(sourceToJson(source)),
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
  }, []);

  return { state, controls: controls.current };
}
