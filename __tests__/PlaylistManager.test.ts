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
});
