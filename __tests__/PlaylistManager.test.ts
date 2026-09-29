import { buildOrder, createQueue, currentIndex, nextCursor, previousCursor, setRepeat } from '../src/core/PlaylistManager';
import type { Track } from '../src/types';

const mk = (id: string): Track => ({ id, source: { uri: `https://cdn.test/${id}.mp3` } });

describe('PlaylistManager', () => {
  test('buildOrder without shuffle preserves order', () => {
    expect(buildOrder(3, false)).toEqual([0, 1, 2]);
  });

  test('buildOrder with shuffle keeps all indices', () => {
    const order = buildOrder(5, true);
    expect(order.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  test('buildOrder with shuffle + preserveCurrent keeps current first', () => {
    const order = buildOrder(4, true, 2);
    expect(order[0]).toBe(2);
    expect(order.sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  test('nextCursor advances and signals stop at end when repeat off', () => {
    const q = createQueue([mk('a'), mk('b')], false, 'off');
    expect(nextCursor(q)).toEqual({ cursor: 1, stop: false });
    expect(nextCursor({ ...q, cursor: 1 })).toEqual({ cursor: 1, stop: true });
  });

  test('nextCursor wraps when repeat queue', () => {
    const q = createQueue([mk('a'), mk('b')], false, 'queue');
    expect(nextCursor({ ...q, cursor: 1 })).toEqual({ cursor: 0, stop: false });
  });

  test('previousCursor', () => {
    const q = createQueue([mk('a'), mk('b'), mk('c')], false, 'off');
    expect(previousCursor({ ...q, cursor: 1 })).toBe(0);
    expect(previousCursor({ ...q, cursor: 0 })).toBe(0);
  });

  test('previousCursor wraps when repeat queue', () => {
    const q = createQueue([mk('a'), mk('b')], false, 'queue');
    expect(previousCursor({ ...q, cursor: 0 })).toBe(1);
  });

  test('setRepeat', () => {
    const q = createQueue([mk('a')], false, 'off');
    expect(setRepeat(q, 'track').repeat).toBe('track');
  });

  test('currentIndex', () => {
    const q = createQueue([mk('a'), mk('b')], false, 'off');
    expect(currentIndex(q)).toBe(0);
  });

  // The sentinel below is load-bearing for every consumer that does
  // `tracks[currentIndex(q)]` without a guard, and the web player relies on it
  // to report "no current track" once the queue is emptied. See FG-4.4.
  test('currentIndex returns -1 for an empty queue', () => {
    const q = createQueue([], false, 'off');
    expect(currentIndex(q)).toBe(-1);
    // And it stays -1 rather than resolving to a stale track.
    expect(q.tracks[currentIndex(q)]).toBeUndefined();
  });

  test('currentIndex resolves a shuffled order to a real track', () => {
    const tracks = [mk('a'), mk('b'), mk('c'), mk('d')];
    const q = createQueue(tracks, true, 'off');
    for (let cursor = 0; cursor < q.order.length; cursor++) {
      const idx = currentIndex({ ...q, cursor });
      // A cursor is an index into `order`, not into `tracks`. Confusing the two
      // is the defect FG-4.4 tracks, and it only shows up under shuffle.
      expect(idx).toBe(q.order[cursor]);
      expect(tracks[idx]).toBeDefined();
    }
  });

  test('cursor past the end of order yields -1, not undefined', () => {
    const q = createQueue([mk('a')], false, 'off');
    expect(currentIndex({ ...q, cursor: 5 })).toBe(-1);
  });
});
