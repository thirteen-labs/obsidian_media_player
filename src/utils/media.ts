import type { MediaSource, PlaybackState, Track } from '../types';
import { safeJsonParse } from './platform';

export function sourceToJson(source: MediaSource): string {
  return JSON.stringify(source);
}

export function parseState(json?: string | null): PlaybackState | null {
  return safeJsonParse<PlaybackState | null>(json ?? null, null);
}

export function trackToJson(track: Track): string {
  return JSON.stringify(track);
}

export function tracksToJson(tracks: Track[]): string {
  return JSON.stringify(tracks.map((t) => ({ ...t, source: t.source })));
}

export const INITIAL_STATE: PlaybackState = {
  status: 'idle',
  position: 0,
  duration: 0,
  rate: 1,
  muted: false,
  volume: 1,
  buffered: 0,
  inBackground: false,
};
