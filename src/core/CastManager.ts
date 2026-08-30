import type { CastDevice } from '../types';

/**
 * Casting stub. The interface is stable so platform implementations can be
 * dropped in later (Chromecast on Android, AirPlay on iOS) without changing
 * the public API. Methods are intentionally no-ops for now.
 */
export class CastManager {
  private listeners = new Set<(device: CastDevice | null) => void>();
  private active: CastDevice | null = null;

  get currentDevice(): CastDevice | null {
    return this.active;
  }

  async discover(): Promise<CastDevice[]> {
    return [];
  }

  async connect(_device: CastDevice): Promise<void> {
    this.active = _device;
    this.emit();
  }

  async disconnect(): Promise<void> {
    this.active = null;
    this.emit();
  }

  onDeviceChange(cb: (device: CastDevice | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    this.listeners.forEach((cb) => cb(this.active));
  }
}

export const castManager = new CastManager();
