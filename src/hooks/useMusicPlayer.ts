import { useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import MusicPlayerNative from '../native/MusicPlayerNative';
import { MUSIC_EVENTS } from '../core/Events';
import { INITIAL_STATE, parseState, tracksToJson } from '../utils/media';
import type {
  PlaybackState,
  RemoteControlOptions,
  RepeatMode,
  Track,
} from '../types';

export interface QueueSnapshot {
  tracks: Track[];
  index: number;
}

export interface MusicControls {
  setQueue: (tracks: Track[]) => void;
  addTracks: (tracks: Track[]) => void;
  removeTrack: (id: string) => void;
  skipTo: (index: number) => void;
  next: () => void;
  previous: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setRepeatMode: (mode: RepeatMode) => void;
  setShuffle: (shuffle: boolean) => void;
  setRemoteControls: (options: RemoteControlOptions) => void;
  setBackgroundEnabled: (enabled: boolean) => void;
  getQueue: () => Promise<QueueSnapshot | null>;
  getState: () => Promise<PlaybackState | null>;
}

export function useMusicPlayer(initialTracks: Track[] = []): {
  state: PlaybackState;
  queue: QueueSnapshot;
  controls: MusicControls;
} {
  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
  const [queue, setQueueState] = useState<QueueSnapshot>({
    tracks: initialTracks,
    index: 0,
  });

  useEffect(() => {
    const emitter = new NativeEventEmitter(MusicPlayerNative as any);

    const onState = (e: any) => {
      const parsed = parseState(e?.stateJson);
      if (parsed) setState(parsed);
    };
    const onProgress = (e: any) =>
      setState((prev) => ({
        ...prev,
        position: e?.position ?? prev.position,
        duration: e?.duration ?? prev.duration,
      }));
    const onTrackChange = (e: any) =>
      setQueueState((prev) => ({ ...prev, index: e?.index ?? prev.index }));
    const onQueueChange = (e: any) =>
      setQueueState((prev) => ({
        ...prev,
        tracks: e?.tracks ?? prev.tracks,
        index: e?.index ?? prev.index,
      }));

    const subs = [
      emitter.addListener(MUSIC_EVENTS.STATE, onState),
      emitter.addListener(MUSIC_EVENTS.PROGRESS, onProgress),
      emitter.addListener(MUSIC_EVENTS.TRACK_CHANGE, onTrackChange),
      emitter.addListener(MUSIC_EVENTS.QUEUE_CHANGE, onQueueChange),
    ];

    [
      MUSIC_EVENTS.STATE,
      MUSIC_EVENTS.PROGRESS,
      MUSIC_EVENTS.TRACK_CHANGE,
      MUSIC_EVENTS.QUEUE_CHANGE,
    ].forEach((name) => MusicPlayerNative.addListener(name));

    return () => {
      subs.forEach((s) => s.remove());
      MusicPlayerNative.removeListeners(4);
    };
  }, []);

  const controls = useRef<MusicControls>({
    setQueue: (tracks) => {
      setQueueState((prev) => ({ ...prev, tracks }));
      MusicPlayerNative.setQueue(tracksToJson(tracks));
    },
    addTracks: (tracks) => MusicPlayerNative.addTracks(tracksToJson(tracks)),
    removeTrack: (id) => MusicPlayerNative.removeTrack(id),
    skipTo: (index) => MusicPlayerNative.skipTo(index),
    next: () => MusicPlayerNative.next(),
    previous: () => MusicPlayerNative.previous(),
    play: () => MusicPlayerNative.play(),
    pause: () => MusicPlayerNative.pause(),
    stop: () => MusicPlayerNative.stop(),
    seek: (seconds) => MusicPlayerNative.seek(seconds),
    setRate: (rate) => MusicPlayerNative.setRate(rate),
    setVolume: (volume) => MusicPlayerNative.setVolume(volume),
    setMuted: (muted) => MusicPlayerNative.setMuted(muted),
    setRepeatMode: (mode) => MusicPlayerNative.setRepeatMode(mode),
    setShuffle: (shuffle) => MusicPlayerNative.setShuffle(shuffle),
    setRemoteControls: (options) =>
      MusicPlayerNative.setRemoteControls(JSON.stringify(options)),
    setBackgroundEnabled: (enabled) =>
      MusicPlayerNative.setBackgroundEnabled(enabled),
    getQueue: async () => {
      const raw = await MusicPlayerNative.getCurrentQueue();
      try {
        return JSON.parse(raw) as QueueSnapshot;
      } catch {
        return null;
      }
    },
    getState: async () => parseState(await MusicPlayerNative.getCurrentState()),
  });

  useEffect(() => {
    if (initialTracks.length) {
      MusicPlayerNative.setQueue(tracksToJson(initialTracks));
    }
    return () => {
      MusicPlayerNative.setBackgroundEnabled(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, queue, controls: controls.current };
}
