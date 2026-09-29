/**
 * Which Android SDK packages does a scaffolded RN host app need?
 *
 * Extracted from `verify-android-host.mjs` so it can be regression-tested
 * without scaffolding an app: the module has no top-level side effects, so
 * importing it runs nothing.
 *
 * ## Why this exists
 *
 * The set of packages a `verify:android:host` run needs is a function of the
 * *template*, not of this repository. RN 0.74.7 pins
 * `compileSdkVersion = 34` / `buildToolsVersion = "34.0.0"` /
 * `ndkVersion = "26.1.10909125"` in its buildscript `ext`; a different `--rn`
 * pins different numbers. Meanwhile `scripts/verify-android-kotlin.mjs` pins its
 * own `PLATFORM = '35'`, so one CI job legitimately needs two platforms.
 *
 * AGP *auto-downloads* a missing SDK package, so a stale package list does not
 * fail fast — it burns several minutes of `assembleRelease` and then fails
 * somewhere unrelated, or silently succeeds minutes later. That is the worst
 * possible failure mode for a gate: red for the wrong reason, or green for the
 * wrong reason, with no way to tell which from the log.
 *
 * So the pins are read from the template that was just scaffolded, checked
 * against the SDK actually on this machine, and reported as a single
 * `sdkmanager` line.
 */

/** SDK roots to probe, in the same order as `ANDROID_HOME` convention. */
export function sdkRootCandidates(env, home) {
  return [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    `${home}/AppData/Local/Android/Sdk`,
    `${home}/Library/Android/sdk`,
    `${home}/Android/Sdk`,
    '/usr/local/lib/android/sdk',
  ].filter(Boolean);
}

/**
 * The Gradle project name the autolinker gives this package.
 *
 * This is a transcription of one line in
 * `@react-native-community/cli-platform-android/native_modules.gradle`:
 *
 *   def nameCleansed = name.replaceAll('[~*!\'()]+', '_')
 *                           .replaceAll('^@([\\w-.]+)/', '$1_')
 *
 * A scoped package therefore does NOT keep its `/`: the scope and the name are
 * joined by an underscore into a single token, so
 * `@obsidian_north/media-player` becomes `:obsidian_north_media-player`.
 *
 * It is duplicated rather than imported because it lives inside a Groovy Gradle
 * plugin inside node_modules — there is no supported way to call it from Node.
 * That makes it a re-implementation that can drift, so it is tested against the
 * cases that actually occur (unscoped, scoped, hyphens, underscores, and the
 * characters the first replaceAll exists to strip). The one thing that must never
 * happen is silently returning the raw package name for a scoped package, which
 * turns a rename into "project with path ':x' could not be found".
 */
export function gradleProjectName(name) {
  return name
    .replace(/[~*!'()]+/g, '_')
    .replace(/^@([\w\-.]+)\//, '$1_');
}

/**
 * Pull a `name = "value"` pin out of a template build.gradle.
 *
 * Deliberately a regex and not a Gradle parse: the input is a fixed, published
 * template file, and the failure mode we care about is a pin that moved, which a
 * regex reports as "not found" rather than as a wrong number.
 */
export function readHostPin(hostExt, name) {
  const m = hostExt.match(new RegExp(`${name}\\s*=\\s*"?([\\w.\\-]+)"?`));
  if (!m) {
    throw new Error(
      `could not read ${name} out of the scaffolded template's build.gradle.\n` +
        'The preflight cannot tell what the SDK needs, so the package list in\n' +
        '.github/workflows/ci.yml has to be kept in sync by hand.',
    );
  }
  return m[1];
}

/**
 * The packages the host asks for, as `{ dir, pkg }` pairs. `dir` is relative to
 * the SDK root (what `existsSync` checks); `pkg` is the sdkmanager coordinate
 * (what the error message tells the user to install).
 *
 * `cmake` is deliberately absent: the module's `externalNativeBuild.cmake` block
 * pins no version, so AGP picks its own default and reports a missing one with a
 * message that already names the package.
 */
export function requiredPackages(hostExt) {
  const compileSdk = readHostPin(hostExt, 'compileSdkVersion');
  const buildTools = readHostPin(hostExt, 'buildToolsVersion');
  const ndk = readHostPin(hostExt, 'ndkVersion');
  return [
    { dir: ['platforms', `android-${compileSdk}`], pkg: `platforms;android-${compileSdk}` },
    { dir: ['build-tools', buildTools], pkg: `build-tools;${buildTools}` },
    { dir: ['ndk', ndk], pkg: `ndk;${ndk}` },
  ];
}

/**
 * Check the SDK against `requiredPackages`.
 *
 * `exists` must be **single-argument** — `fs.existsSync(p)` — and is handed the
 * fully-resolved path, root included.
 *
 * That is not a stylistic choice. The first version of this took
 * `exists(sdkRoot, dir)` and was passed `existsSync` directly, which is variadic:
 * `existsSync(p, access)` treats the second argument as a mode flag, so the call
 * collapsed to "does the SDK root exist" and the preflight reported `ok: true`
 * with no NDK and no `platforms/android-34` installed. The unit tests used a fake
 * that honoured the two-argument shape and passed happily, so the bug survived
 * a green suite and would have shipped a green preflight into CI. All path
 * building therefore stays in here, where it is tested, rather than in the caller.
 *
 * `exists` is still injected so the tests can use a fake tree, and so the caller
 * decides what "the package is installed" means. Returns `{ ok, sdkRoot, missing,
 * message }`.
 *
 * When `sdkRoot` is null (no SDK at all) every package counts as missing, so the
 * message is the same actionable `sdkmanager` line rather than a separate "no
 * SDK" branch that nobody exercises.
 */
export function checkSdk({ sdkRoot, required, exists }) {
  // Forward slashes on purpose: `existsSync` accepts them on Windows, and this
  // keeps the resolved path identical on every platform so the tests and the
  // real call agree on the exact string.
  const pathOf = (dir) => [sdkRoot, ...dir].join('/');
  const missing = sdkRoot ? required.filter((r) => !exists(pathOf(r.dir))) : required;
  const paths = missing.map((r) => r.dir.join('/'));
  if (missing.length) {
    const header = sdkRoot
      ? `Android SDK at ${sdkRoot} is missing:`
      : 'No Android SDK found. It is missing:';
    return {
      ok: false,
      sdkRoot,
      missing,
      message:
        `${header}\n${paths.map((p) => `  ${p}`).join('\n')}\n\n` +
        'The scaffolded RN template asks for these, and this module reads\n' +
        'compileSdkVersion / ndkVersion off the host rootProject.ext, so a missing\n' +
        'one is not a warning — the build cannot be trusted.\n\n' +
        'Fix:\n' +
        `  sdkmanager ${missing.map((r) => `"${r.pkg}"`).join(' ')}\n\n` +
        'If the list in .github/workflows/ci.yml no longer matches, update it too.',
    };
  }
  return {
    ok: true,
    sdkRoot,
    missing: [],
    message: `SDK preflight OK — ${required.map((r) => r.dir.join('/')).join(', ')}`,
  };
}
