/**
 * FG-0.6: the SDK preflight that `verify:android:host` runs before its build.
 *
 * ## Why this is tested at all
 *
 * The preflight exists to turn one failure ("the CI package list is stale")
 * into a different, legible one. That only helps if it actually *detects* a
 * missing package — and a check that returns `ok: true` unconditionally is the
 * classic way to make a build fail slowly and confusingly instead of fast and
 * clearly. So: every detection path below is mutation-checked.
 *
 * ## The fixture
 *
 * `TEMPLATE_074` is the `ext` block of the `android/build.gradle` inside the
 * published `react-native@0.74.7` package, verbatim. Not a hand-written
 * approximation: the whole point is that these are the numbers a real scaffold
 * produces, and the ci.yml package list is derived from them.
 */

// @ts-expect-error - plain ESM helper module under scripts/, not part of src/
import {
  checkSdk, gradleProjectName, readHostPin, requiredPackages, sdkRootCandidates,
} from '../scripts/ci/android-sdk-preflight.mjs';

const TEMPLATE_074 = `buildscript {
    ext {
        buildToolsVersion = "34.0.0"
        minSdkVersion = 23
        compileSdkVersion = 34
        targetSdkVersion = 34
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.9.22"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin")
    }
}
`;

/**
 * A fake SDK. Paths are given resolved against the root, the same shape
 * `checkSdk` hands them over — see the arity note in `checkSdk resolves the
 * package path itself` for why the two-argument shape is not used.
 */
const sdkWith = (...installed: string[]) => {
  const tree = new Set(installed);
  return (p: string) => tree.has(p);
};

const REQUIRED = requiredPackages(TEMPLATE_074);
const SDK = '/sdk';
/** Resolve a path against the fake SDK root. */
const at = (...paths: string[]) => paths.map((p) => `${SDK}/${p}`);

describe('readHostPin', () => {
  it('reads a quoted pin', () => {
    expect(readHostPin(TEMPLATE_074, 'ndkVersion')).toBe('26.1.10909125');
  });

  it('reads an unquoted pin', () => {
    expect(readHostPin(TEMPLATE_074, 'compileSdkVersion')).toBe('34');
  });

  // The whole preflight degrades to "sync ci.yml by hand" if a template renames
  // a pin, so an unrecognised pin has to throw rather than return undefined.
  it('throws on a pin the template does not declare', () => {
    expect(() => readHostPin(TEMPLATE_074, 'agpVersion')).toThrow(
      /could not read agpVersion/,
    );
  });
});

describe('requiredPackages', () => {
  it('derives the platform, build-tools and NDK from the template', () => {
    expect(REQUIRED.map((r) => r.pkg)).toEqual([
      'platforms;android-34',
      'build-tools;34.0.0',
      'ndk;26.1.10909125',
    ]);
  });

  // The `pkg` string is what the user is told to type into a terminal; the
  // `dir` is what is checked on disk. If they drift apart, the fix printed in
  // the error message does not work.
  it('pairs each check path with the sdkmanager coordinate that installs it', () => {
    expect(REQUIRED.map((r) => r.dir.join('/'))).toEqual([
      'platforms/android-34',
      'build-tools/34.0.0',
      'ndk/26.1.10909125',
    ]);
  });

  it('follows the template when a different RN version moves the pins', () => {
    const other = requiredPackages('ext { buildToolsVersion = "35.0.1"\n compileSdkVersion = 35\n ndkVersion = "27.1.12297006" }');
    expect(other.map((r) => r.pkg)).toEqual([
      'platforms;android-35',
      'build-tools;35.0.1',
      'ndk;27.1.12297006',
    ]);
  });
});

describe('checkSdk', () => {
  const all = at('platforms/android-34', 'build-tools/34.0.0', 'ndk/26.1.10909125');

  it('passes when every package is installed', () => {
    const r = checkSdk({ sdkRoot: SDK, required: REQUIRED, exists: sdkWith(...all) });
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.message).toContain('platforms/android-34');
  });

  // Each of these is a distinct real failure mode: AGP auto-downloads platforms
  // and build-tools, and silently substitutes a different NDK. All three hide
  // themselves, which is the entire reason this preflight exists.
  it.each([
    ['platforms/android-34', 'platforms;android-34'],
    ['build-tools/34.0.0', 'build-tools;34.0.0'],
    ['ndk/26.1.10909125', 'ndk;26.1.10909125'],
  ])('fails when only %s is missing', (missingPath, missingPkg) => {
    const present = all.filter((p) => p !== `${SDK}/${missingPath}`);
    const r = checkSdk({ sdkRoot: SDK, required: REQUIRED, exists: sdkWith(...present) });
    expect(r.ok).toBe(false);
    expect(r.missing.map((x) => x.pkg)).toEqual([missingPkg]);
    expect(r.message).toContain(`"${missingPkg}"`);
  });

  it('names every missing package, not just the first', () => {
    const r = checkSdk({ sdkRoot: SDK, required: REQUIRED, exists: sdkWith() });
    expect(r.missing).toHaveLength(3);
    expect(r.message).toMatch(/sdkmanager "platforms;android-34" "build-tools;34\.0\.0" "ndk;26\.1\.10909125"/);
  });

  it('prints a runnable sdkmanager line', () => {
    const r = checkSdk({ sdkRoot: SDK, required: REQUIRED, exists: sdkWith() });
    expect(r.message).toContain('sdkmanager "platforms;android-34"');
  });

  it('still reports the install list when no SDK exists at all', () => {
    const r = checkSdk({ sdkRoot: null, required: REQUIRED, exists: sdkWith() });
    expect(r.ok).toBe(false);
    expect(r.missing).toHaveLength(3);
    expect(r.message).toMatch(/No Android SDK found/);
    expect(r.message).toMatch(/sdkmanager "platforms;android-34"/);
  });
});

describe('checkSdk resolves the package path itself', () => {
  // This is a regression test for a bug that shipped in the first version of
  // this module and passed the whole suite: `checkSdk` used to call
  // `exists(sdkRoot, r.dir)`, and the real `fs.existsSync` is *variadic* —
  // `existsSync(path, access)` — so the second argument was swallowed as a mode
  // flag and the check collapsed to "does the SDK root exist". With no NDK and
  // no `platforms/android-34` installed, it returned `ok: true`.
  //
  // The fake `exists` above accepts `(root, dir)`, so it could not catch that.
  // These two use a spy that is `fs.existsSync`-shaped and arity-strict, which
  // is the only shape that can.
  it('passes exactly one argument, and it is the full package path', () => {
    // Records *every* argument, so a second argument shows up in `seen` and the
    // assertion below fails — which is the whole point.
    const seen: string[] = [];
    const spy = (...args: string[]) => {
      seen.push(...args);
      return false;
    };
    checkSdk({ sdkRoot: '/sdk', required: REQUIRED, exists: spy });
    expect(seen).toEqual([
      '/sdk/platforms/android-34',
      '/sdk/build-tools/34.0.0',
      '/sdk/ndk/26.1.10909125',
    ]);
  });

  it('cannot be fooled into testing the root when a package is absent', () => {
    // An existsSync-shaped fake: arity 1, and "the root" is present while its
    // children are not — the exact state of a real SDK missing an NDK.
    const rootExists = new Set(['/sdk']);
    const existsSyncShaped = (p: string) => rootExists.has(p);
    const r = checkSdk({
      sdkRoot: '/sdk',
      required: REQUIRED,
      exists: existsSyncShaped,
    });
    expect(r.ok).toBe(false);
    expect(r.missing).toHaveLength(3);
  });
});

describe('gradleProjectName', () => {
  // Mirrors native_modules.gradle:
  //   name.replaceAll('[~*!'()]+', '_').replaceAll('^@([\w-.]+)/', '$1_')
  it('passes an unscoped name through unchanged', () => {
    expect(gradleProjectName('obsidian-media-player')).toBe('obsidian-media-player');
  });

  // The one that matters. A scoped name does NOT keep its `/` — the scope and
  // the name are fused with an underscore, so a gate that assumed `:obsidian-
  // media-player` would fail with "project with path not found".
  it('fuses the scope and name with an underscore', () => {
    expect(gradleProjectName('@obsidian_north/media-player'))
      .toBe('obsidian_north_media-player');
  });

  it('handles a hyphenated scope the same way', () => {
    expect(gradleProjectName('@react-native-community/slider'))
      .toBe('react-native-community_slider');
  });

  // The `+` quantifier collapses a *run* of rejected characters to a single `_`,
  // which is Groovy's `replaceAll` semantics and is why the transcription is not
  // a per-character map.
  it('collapses a run of rejected characters to one underscore', () => {
    expect(gradleProjectName("weird~name!*'()here")).toBe('weird_name_here');
  });

  // A dot is in the `[\w-.]` character class, so a dotted scope survives intact.
  it('keeps dots inside the scope', () => {
    expect(gradleProjectName('@my.scope.name/thing')).toBe('my.scope.name_thing');
  });

  // Guards the specific failure this exists to prevent: returning the package
  // name unchanged for a scoped package.
  it('never returns a scoped name containing a slash', () => {
    for (const n of ['@a/b', '@scope/pkg', '@x.y/z-w']) {
      expect(gradleProjectName(n)).not.toContain('/');
    }
  });

  // The JS above is a re-implementation of a Groovy line, so it can drift from
  // it. These are the exact values produced by running the same two regexes
  // through the JDK (Groovy's String.replaceAll is Pattern.matcher.replaceAll,
  // i.e. the same java.util.regex engine), captured so the JS is pinned to a
  // real execution of the real expression rather than to my reading of it.
  // Re-derive with: java Cleansed.java
  it.each([
    ['obsidian-media-player', 'obsidian-media-player'],
    ['@obsidian_north/media-player', 'obsidian_north_media-player'],
    ['@my.scope.name/thing', 'my.scope.name_thing'],
    ["weird~name!*'()here", 'weird_name_here'],
    ['@react-native-community/slider', 'react-native-community_slider'],
    ['@a/b', 'a_b'],
  ])('matches java.util.regex on %s', (input, expected) => {
    expect(gradleProjectName(input)).toBe(expected);
  });
});

describe('sdkRootCandidates', () => {
  // The first two are the documented overrides and must be probed in that order;
  // the rest are per-OS defaults that only get reached when neither is set.
  it('probes ANDROID_HOME, then ANDROID_SDK_ROOT, before any default', () => {
    const c = sdkRootCandidates(
      { ANDROID_HOME: '/from-home', ANDROID_SDK_ROOT: '/from-root' },
      '/users/me',
    );
    expect(c.slice(0, 2)).toEqual(['/from-home', '/from-root']);
    expect(c).toContain('/users/me/Library/Android/sdk');
    expect(c).toContain('/usr/local/lib/android/sdk');
  });

  it('covers the Windows, macOS and Linux default locations', () => {
    const c = sdkRootCandidates({}, '/users/me');
    expect(c).toEqual([
      '/users/me/AppData/Local/Android/Sdk',
      '/users/me/Library/Android/sdk',
      '/users/me/Android/Sdk',
      '/usr/local/lib/android/sdk',
    ]);
  });

  // A stale ANDROID_HOME pointing at an SDK with no platforms in it used to send
  // verify-android-kotlin into a different SDK than the one Gradle used. Same
  // hazard, same reason to check every candidate rather than only the first.
  it('offers more than one candidate and never repeats one', () => {
    const c = sdkRootCandidates({ ANDROID_HOME: '/from-home' }, '/users/me');
    expect(c.length).toBeGreaterThan(1);
    expect(new Set(c).size).toBe(c.length);
  });
});
