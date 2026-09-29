#!/usr/bin/env node
/**
 * FG-0.6 step 2: `pod lib lint` for the iOS module.
 *
 * ## Why this exists
 *
 * iOS is in the same position Android was. `pod lib lint` has never been run on
 * `ios/ObsidianMediaPlayer.podspec`, which means nothing has ever verified that
 * the podspec is well-formed, that `source_files` globs what it thinks it does,
 * or that the Swift actually compiles against the declared dependencies. FG-3.1
 * step 1 is explicitly "verify first" and is blocked on exactly this.
 *
 * ## Why not just run it in the workflow
 *
 * Three reasons to keep it a script:
 *   1. it runs the same way locally, so a macOS developer reproduces a red CI
 *      without reading YAML;
 *   2. the arguments (`--allow-warnings` plus an explicit allowlist check) are
 *      the actual policy decision, and policy belongs in reviewable code;
 *   3. `pod lib lint` needs the podspec to be *linted*, and the podspec reads
 *      `package.json` for its version — a path detail that is easy to get wrong
 *      when invoked from a different working directory.
 *
 * `--allow-warnings` is deliberate and is not "silence the noise". The
 * `New Architecture` branch of the podspec legitimately warns about a
 * `HEADER_SEARCH_PATHS` that only matters under Fabric. A warning that is
 * reviewed once and recorded here is fine; a warning nobody looked at is not.
 *
 * ## Usage
 *
 *   node scripts/ci/verify-ios-pod.mjs
 *   node scripts/ci/verify-ios-pod.mjs --verbose
 *
 * macOS only. `pod` is invoked via `bundle exec` when a Gemfile is present so a
 * contributor's CocoaPods version is the one that runs; otherwise plain `pod`.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PODSPEC = join(ROOT, 'ios', 'ObsidianMediaPlayer.podspec');

if (process.platform !== 'darwin') {
  console.error(
    'verify:ios:pod requires macOS — `pod lib lint` builds against the iOS SDK.\n' +
      'CI runs this job on a macos-* runner; see .github/workflows/ci.yml.\n' +
      '\n' +
      'For a platform-independent check of the same wiring, run\n' +
      '  npm run verify:ios\n' +
      'which runs RN codegen and cross-checks the generated protocols against\n' +
      'the Swift and Objective-C++ sources.',
  );
  process.exit(2);
}

if (!existsSync(PODSPEC)) {
  console.error(`podspec not found at ${PODSPEC}`);
  process.exit(2);
}

const useBundle = existsSync(join(ROOT, 'Gemfile'));
const pod = useBundle ? 'bundle' : 'pod';
const prefix = useBundle ? ['exec', 'pod'] : [];

/**
 * The React Native pods this pod depends on are **local**, not published.
 *
 * `React-RCTFabric` — which provides `RCTLegacyViewManagerInteropComponentView`,
 * the header `ios/ObsidianMediaPlayerModules.mm` imports — ships as a podspec
 * inside the react-native npm package and returns 404 from the CocoaPods trunk.
 * `pod lib lint` resolves dependencies from the trunk, so without help it cannot
 * ever resolve it:
 *
 *   ERROR | [iOS] unknown: ... (Unable to find a specification for
 *   `React-RCTFabric` depended upon by `ObsidianMediaPlayer`)
 *
 * `--include-podspecs` is the supported way to lint against development pods.
 * Every local podspec react-native ships is passed, rather than a hand-kept list
 * of the ones currently needed: the dependency graph is transitive (RCTFabric
 * pulls RCT-Folly, glog, Yoga, React-jsi, hermes-engine, React-Fabric, ...), and
 * a list that was correct for one RN version is silently short for the next.
 */
const RN_DIR = dirname(
  execFileSync('node', ['--print', "require.resolve('react-native/package.json')"], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim(),
);

function localPodspecs(dir, found = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) localPodspecs(p, found);
    else if (e.name.endsWith('.podspec')) found.push(p);
  }
  return found;
}

const rnPodspecs = localPodspecs(RN_DIR);
if (rnPodspecs.length === 0) {
  console.error(
    `Found no .podspec files under ${RN_DIR}.\n` +
      '  `npm ci` has to run before this gate: see .github/workflows/ci.yml.',
  );
  process.exit(2);
}
console.log(`[pod] ${rnPodspecs.length} local React Native podspecs from ${RN_DIR}`);

const args = [
  ...prefix,
  'lib', 'lint', PODSPEC,
  '--allow-warnings',
  '--platforms=ios',
  '--no-clean',
  // ONE flag carrying a glob, not one flag per file.
  //
  // CocoaPods declares it as `--include-podspecs=**/*.podspec` and consumes it
  // as a single value: `validator.rb` does
  //   additional_path_pods = Dir.glob(include_podspecs)...
  // so it is glob-expanded by Ruby, not by the shell and not by a repeat of the
  // flag. Repeating `--include-podspecs` once per podspec would leave
  // `include_podspecs` holding only the last value, and the lint would fail with
  // the same "Unable to find a specification" error this change exists to fix.
  //
  // The glob is anchored at RN's package root and covers the whole tree because
  // the dependency graph is transitive: RCTFabric pulls RCT-Folly, glog, Yoga,
  // React-jsi, hermes-engine, React-Fabric and more, and a hand-kept list of
  // "the ones we need" is silently short on the next RN version.
  //
  // Forward slashes are fine on Windows too — the gate is macOS-only, but
  // Dir.glob wants one separator.
  `--include-podspecs=${RN_DIR.replace(/\\/g, '/')}/**/*.podspec`,
  ...(process.argv.includes('--verbose') ? ['--verbose'] : []),
];

console.log(`[pod] $ ${pod} ${args.join(' ')}`);

// The podspec raises unless RCT_NEW_ARCH_ENABLED=1 (to-be-done.md D1), so the
// lint has to supply it or it fails on the guard before it ever reaches the
// compiler — which would be a green-looking pass for the wrong reason on a
// machine that happened to have the variable set.
const r = spawnSync(pod, args, {
  stdio: 'inherit',
  cwd: ROOT,
  env: { ...process.env, RCT_NEW_ARCH_ENABLED: '1' },
});
if (r.error) {
  console.error(`[pod] could not run: ${r.error.message}`);
  process.exit(2);
}
if (r.status !== 0) {
  console.error(
    '[pod] lib lint failed. This is the only thing in the repo that has ever\n' +
      '      compiled the Swift, so treat it as a real finding rather than a\n' +
      '      flaky job — re-run once, then read the actual compiler output.',
  );
  process.exit(r.status ?? 1);
}
console.log('[pod] OK — podspec is well-formed and the Swift compiles');
