import { CastManager, type CastProvider } from '../src/core/CastManager';
import type { CastDevice } from '../src/types';

const device = (id: string): CastDevice => ({ id, name: id, type: 'chromecast' });

function stubProvider(devices: CastDevice[] = [device('a')]): CastProvider & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    isSupported: () => true,
    discover: async () => {
      calls.push('discover');
      return devices;
    },
    connect: async () => {
      calls.push('connect');
    },
    disconnect: async () => {
      calls.push('disconnect');
    },
  };
}

describe('CastManager (FG-6.3)', () => {
  test('unsupported until a provider is registered', () => {
    const m = new CastManager();
    expect(m.isSupported).toBe(false);
    expect(m.currentDevice).toBeNull();
  });

  test('discover returns [] with no provider (not a throw)', async () => {
    const m = new CastManager();
    await expect(m.discover()).resolves.toEqual([]);
  });

  test('connect without a provider rejects with an actionable message', async () => {
    const m = new CastManager();
    await expect(m.connect(device('x'))).rejects.toThrow(/no CastProvider/i);
    expect(m.currentDevice).toBeNull();
  });

  test('provider backs discover/connect/disconnect + listeners', async () => {
    const m = new CastManager();
    const p = stubProvider([device('a'), device('b')]);
    m.registerProvider(p);
    expect(m.isSupported).toBe(true);

    await expect(m.discover()).resolves.toHaveLength(2);
    expect(p.calls).toEqual(['discover']);

    const seen: Array<CastDevice | null> = [];
    const off = m.onDeviceChange((d) => seen.push(d));
    await m.connect(device('a'));
    expect(m.currentDevice?.id).toBe('a');
    await m.disconnect();
    expect(m.currentDevice).toBeNull();
    expect(seen.map((d) => d?.id ?? null)).toEqual(['a', null]);
    off();
  });

  test('unregistering the provider returns to unsupported', async () => {
    const m = new CastManager();
    m.registerProvider(stubProvider());
    expect(m.isSupported).toBe(true);
    m.registerProvider(null);
    expect(m.isSupported).toBe(false);
    await expect(m.discover()).resolves.toEqual([]);
  });

  test('a throwing isSupported degrades to false, never throws', () => {
    const m = new CastManager();
    m.registerProvider({
      isSupported: () => {
        throw new Error('nope');
      },
      discover: async () => [],
      connect: async () => undefined,
      disconnect: async () => undefined,
    });
    expect(m.isSupported).toBe(false);
  });
});
