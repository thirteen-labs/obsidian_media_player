/**
 * Architecture-registration tests (to-be-done.md Wave 3).
 *
 * These exist because the failures they cover were invisible three separate
 * ways at once. Nothing in the JS layer could see them: the native side was
 * never compiled (FG-0.6), no device ran (FG-2.3's honest note), and the
 * JavaScript that *would* have caught them was a fallback branch that quietly
 * degraded instead of failing.
 *
 * Two things are asserted, and the second is the one that matters most:
 *
 *  1. The JS side resolves TurboModules through `TurboModuleRegistry.get` and
 *     never through `NativeModules` directly. iOS requires the New
 *     Architecture (D1), so a `NativeModules` fallback is a path that cannot
 *     work — and it is exactly the path that hid a `undefined` module behind a
 *     generic "not linked" error.
 *
 *  2. The error names `RCT_NEW_ARCH_ENABLED=1`. A missing native module is
 *     almost never a missing native module; it is the architecture flag, and
 *     the old message ("Did you run `pod install`?") pointed at the wrong fix.
 *
 * The native half — protocol conformance, the interop allowlist — is not
 * testable from jest and is verified by reading the generated codegen output.
 * That boundary is stated in to-be-done.md FG-3.1 rather than glossed over.
 */
import { TurboModuleRegistry, NativeModules } from 'react-native';
import { requireTurboModule } from '../src/native/requireTurboModule';

describe('TurboModule resolution', () => {
  const modules = ['ObsidianAudio', 'ObsidianMusicPlayer', 'ObsidianCache'] as const;

  it('registers all three native modules in the test setup', () => {
    // Guards the suite itself: if this fails, every test below is vacuous.
    modules.forEach((name) => {
      expect(NativeModules[name]).toBeDefined();
    });
  });

  it.each(modules)('resolves %s through TurboModuleRegistry', (name) => {
    expect(requireTurboModule(name)).toBe(
      TurboModuleRegistry.get<unknown>(name)
    );
  });

  it('returns the same object on repeated calls', () => {
    // The accessors run once at import; consumers hold the result for the life
    // of the app. A resolver that rebuilt the module per call would hand out a
    // second native instance.
    expect(requireTurboModule('ObsidianAudio')).toBe(
      requireTurboModule('ObsidianAudio')
    );
  });

  it('throws a message naming RCT_NEW_ARCH_ENABLED=1 for a missing module', () => {
    // The real failure mode. `requireTurboModule` is what the three
    // `src/native/*Native.ts` files call at import time, so this message is the
    // only thing a consumer sees when the architecture flag is unset — and the
    // previous wording said only "native module is not linked", which sent
    // people to re-run `pod install` and gain nothing.
    expect(() => requireTurboModule('ObsidianMissing')).toThrow(
      /RCT_NEW_ARCH_ENABLED=1/
    );
  });

  it('names the missing module in the error', () => {
    expect(() => requireTurboModule('ObsidianMissing')).toThrow(
      /"ObsidianMissing"/
    );
  });

  it('does not tell the reader to re-run pod install as the primary fix', () => {
    // Guards against a well-meaning future edit reintroducing the old wording.
    // `pod install` is mentioned, but only as a follow-up to the flag.
    let message = '';
    try {
      requireTurboModule('ObsidianMissing');
    } catch (e) {
      message = (e as Error).message;
    }
    const flagIndex = message.indexOf('RCT_NEW_ARCH_ENABLED=1');
    const podIndex = message.indexOf('pod install');
    expect(flagIndex).toBeGreaterThanOrEqual(0);
    expect(podIndex === -1 || podIndex > flagIndex).toBe(true);
  });
});

describe('no legacy NativeModules fallback', () => {
  const fs = require('fs');
  const path = require('path');
  const srcDir = path.join(__dirname, '..', 'src', 'native');

  /**
   * Strip comments before scanning.
   *
   * These files discuss `NativeModules` at length — that is the whole point of
   * the change — so a naive grep over raw source would match the explanation
   * and pass for the wrong reason, or fail for a reason that has nothing to do
   * with the code. Blank out `//` and block comments and keep the code.
   */
  function code(file: string): string {
    return fs
      .readFileSync(path.join(srcDir, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
  }

  it('the native accessors do not read NativeModules', () => {
    // Source-level assertion. Importing the accessors for real would need a
    // working native binary, and `require('../specs/...')` is exactly what
    // makes them unimportable under jest — so this reads the file instead.
    ['AudioNative.ts', 'MusicPlayerNative.ts', 'CacheNative.ts'].forEach((f) => {
      const source = code(f);
      expect(source).not.toMatch(/NativeModules/);
      // The old code branched on this global to pick a resolution strategy.
      // With the New Architecture required there is no strategy to pick.
      expect(source).not.toMatch(/__turboModuleProxy/);
    });
  });

  it('requireTurboModule is the only resolver', () => {
    const source = code('requireTurboModule.ts');
    expect(source).toMatch(/TurboModuleRegistry\.get</);
    // A direct read would reintroduce the silent `undefined` that the
    // architecture flag used to cause.
    expect(source).not.toMatch(/NativeModules/);
  });
});
