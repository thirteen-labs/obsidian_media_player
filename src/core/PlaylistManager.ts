import type { RepeatMode, Track } from '../types';

export interface QueueState {
  tracks: Track[];
  /** Order of indices into `tracks` after applying shuffle. */
  order: number[];
  /** Pointer into `order`. */
  cursor: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export function buildOrder(
  length: number,
  shuffle: boolean,
  preserveCurrent = -1
): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  if (!shuffle) return indices;
  // Fisher-Yates, keeping the current track first if requested.
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  if (preserveCurrent >= 0) {
    const pos = indices.indexOf(preserveCurrent);
    if (pos > 0) [indices[0], indices[pos]] = [indices[pos], indices[0]];
  }
  return indices;
}

export function createQueue(
  tracks: Track[],
  shuffle: boolean,
  repeat: RepeatMode
): QueueState {
  return {
    tracks,
    order: buildOrder(tracks.length, shuffle),
    cursor: 0,
    shuffle,
    repeat,
  };
}

export function currentIndex(q: QueueState): number {
  return q.order[q.cursor] ?? -1;
}

export function currentTrack(q: QueueState): Track | undefined {
  return q.tracks[currentIndex(q)];
}

/** Returns the next cursor position and whether playback should stop. */
export function nextCursor(q: QueueState): { cursor: number; stop: boolean } {
  if (q.cursor < q.order.length - 1) {
    return { cursor: q.cursor + 1, stop: false };
  }
  // End of queue.
  if (q.repeat === 'queue') return { cursor: 0, stop: false };
  return { cursor: q.cursor, stop: true };
}

export function previousCursor(q: QueueState): number {
  if (q.cursor > 0) return q.cursor - 1;
  return q.repeat === 'queue' ? q.order.length - 1 : 0;
}

/** Rebuild the shuffle order while keeping the active track playing. */
export function reshuffle(q: QueueState): QueueState {
  const active = currentIndex(q);
  return { ...q, order: buildOrder(q.tracks.length, true, active), cursor: 0 };
}

export function setRepeat(
  q: QueueState,
  repeat: RepeatMode
): QueueState {
  return { ...q, repeat };
}
