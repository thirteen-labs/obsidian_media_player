import type { CastDevice } from '../types';

/**
 * App-driven casting (Chromecast discovery/pick, AirPlay picker).
 *
 * FG-6.3. Status: **provider-less stub with an honest surface**. There is no
 * Cast SDK behind this yet (Android needs the Google Cast SDK + a CastPlayer,
 * iOS needs `AVRoutePickerView` / `GCKDiscoveryManager`), so `isSupported` is
 * `false` and `discover()` returns `[]` until a provider is registered.
 *
 * What already works without this: *system* AirPlay on iOS — the audio
 * session opts in via `.allowAirPlay`, so output can be handed to an AirPlay
 * receiver from Control Center. Only *app-initiated* discovery/pick is
 * missing, and that distinction is what `isSupported` reports.
 *
 * A real implementation (or a host app's own wiring) drops in via
 * `registerProvider` without changing the public API or any call site.
 */
export interface CastProvider {
  /** Whether this provider can actually discover devices here. */
  isSupported(): boolean;
  discover(): Promise<CastDevice[]>;
  connect(device: CastDevice): Promise<void>;
  disconnect(): Promise<void>;
}

export class CastManager {
  private listeners = new Set<(device: CastDevice | null) => void>();
  private active: CastDevice | null = null;
  private provider: CastProvider | null = null;

  /** Install a real casting backend (Cast SDK, AVRoutePicker, or test double). */
  registerProvider(provider: CastProvider | null): void {
    this.provider = provider;
  }

  /** False until a provider is registered — see the module comment. */
  get isSupported(): boolean {
    try {
      return this.provider?.isSupported() ?? false;
    } catch {
      return false;
    }
  }

  get currentDevice(): CastDevice | null {
    return this.active;
  }

  async discover(): Promise<CastDevice[]> {
    if (!this.provider) return [];
    return this.provider.discover();
  }

  async connect(device: CastDevice): Promise<void> {
    if (!this.provider) {
      throw new Error(
        '[obsidian-media-player] Casting is not supported: no CastProvider is ' +
          'registered. System AirPlay (Control Center) still works on iOS; ' +
          'app-driven discovery needs the Cast SDK — see CastManager.registerProvider.'
      );
    }
    await this.provider.connect(device);
    this.active = device;
    this.emit();
  }

  async disconnect(): Promise<void> {
    if (this.provider) await this.provider.disconnect();
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
