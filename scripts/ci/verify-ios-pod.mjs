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
import { basename, dirname, join, resolve } from 'node:path';
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
 * `--external-podspecs` is the supported way to lint against development pods.
 * Every local podspec react-native ships is passed, rather than a hand-kept list
 * of the ones currently needed: the dependency graph is transitive (RCTFabric
 * pulls RCT-Folly, glog, Yoga, React-jsi, hermes-engine, React-Fabric, ...), and
 * a list that was correct for one RN version is silently short for the next.
 *
 * ## Why `--external-podspecs` and not `--include-podspecs`
 *
 * The two flags look interchangeable and are not. Both take the same kind of
 * glob; they differ in how the generated Podfile consumes each podspec, and
 * `pod lib lint --help` spells the difference out:
 *
 *   --include-podspecs=GLOB   "...used for linting via :path"
 *   --external-podspecs=GLOB  "...used for linting via :podspec. If there are
 *                              --include-podspecs, then these are removed
 *                              from them"
 *
 * In `validator.rb#podfile_from_spec` that is literal — one flag becomes a
 * `:path` declaration and the other a `:podspec` declaration:
 *
 *   additional_path_pods.each    { |p| pod File.basename(p, '.*'), :path    => File.dirname(p) }
 *   additional_podspec_pods.each { |p| pod File.basename(p, '.*'), :podspec => p }
 *
 * `:podspec` is how a real app consumes React Native. `use_react_native!` in
 * react_native_pods.rb writes exactly that for every RN pod, and so does
 * `React-Core.podspec` for its own third-party dependencies:
 *
 *   pod 'DoubleConversion', :podspec => '.../third-party-podspecs/DoubleConversion.podspec'
 *
 * An external source is downloaded from the podspec's own `s.source` and its
 * `prepare_command` runs in the downloaded tree. That is the entire reason
 * those third-party podspecs exist: the sources are not next to the podspec.
 * `DoubleConversion.podspec` is three lines of `mv`:
 *
 *   spec.prepare_command = 'mv src double-conversion'
 *   spec.source_files    = 'double-conversion/*.{h,cc}'
 *
 * `:path` says instead "this directory *is* the pod", and `File.dirname` of that
 * podspec is `node_modules/react-native/third-party-podspecs/` — a directory
 * that contains a podspec and no sources at all. So the lint ran
 * `mv src double-conversion` against a tree with no `src`, and stopped on the
 * only error in the run that named no file of ours:
 *
 *   ERROR | [iOS] unknown: Encountered an unknown error (/bin/bash -c
 *   set -e
 *   mv src double-conversion
 *   ) during validation.
 *
 *   mv: rename src to double-conversion: No such file or directory
 *
 * Not specific to DoubleConversion: `boost`, `glog`, `RCT-Folly`, `fmt` and
 * `fast_float` sit in the same directory and fetch their sources the same way.
 * The old flag was still doing its other job — making the trunk-unresolvable
 * pods visible to the resolver — while quietly breaking every pod whose sources
 * live behind a `prepare_command`.
 *
 * ## Why two podspecs are excluded from the glob
 *
 * The glob covers 84 podspecs and every one of them becomes a `pod` declaration
 * in the lint Podfile. CocoaPods validates each declared pod whether or not
 * anything depends on it, and two of RN's are not dependency-shaped at all:
 *
 *   node_modules/react-native/React-Core-prebuilt.podspec
 *   node_modules/react-native/third-party-podspecs/ReactNativeDependencies.podspec
 *
 * Both are opt-in *distribution* podspecs — they install a prebuilt xcframework
 * from a Maven tarball instead of building RN from source. `pod 'React-Core-
 * prebuilt'` is declared in only two places in react_native_pods.rb (lines 164
 * and 259), both guarded by `ReactNativeCoreUtils.build_rncore_from_source()`
 * being false, i.e. by `RCT_USE_PREBUILT_RNCORE=1` *and* the release artifacts
 * existing on Maven. A library podspec calls `install_modules_dependencies`,
 * which adds `React-Core` (line 111 of cocoapods/new_architecture.rb) and never
 * the prebuilt variant. So this gate never needed either file.
 *
 * Declared anyway, they fail validation immediately:
 *
 *   ERROR | [iOS] unknown: The `React-Core-prebuilt` pod failed to validate due
 *   to 1 error:
 *   ERROR | attributes: Missing required attribute `source`.
 *
 * Not because the podspec is malformed. It assigns
 *
 *   s.source = ReactNativeCoreUtils.resolve_podspec_source()
 *
 * and that helper (cocoapods/rncore.rb:88) falls off the end returning **nil**
 * unless `RCT_TESTONLY_RNCORE_TARBALL_PATH` is set or `RCT_USE_PREBUILT_RNCORE`
 * is "1" — see the bare `if` at line 95 with no `else`. This gate sets
 * `RCT_NEW_ARCH_ENABLED=1` and nothing else, so `s.source` is nil and the
 * required-attribute linter reports it as missing.
 *
 * `ReactNativeDependencies.podspec` has the identical shape via
 * `ReactNativeDependenciesUtils.resolve_podspec_source()`
 * (cocoapods/rndependencies.rb:71), which returns nil unless `RCT_USE_RN_DEP`
 * or `RCT_USE_LOCAL_RN_DEP` is set. Excluding only the first would move this
 * error to the second rather than fix it.
 *
 * They are excluded by name and logged, not deleted and not given a fake
 * `source`: they are correct podspecs being read outside the mode that
 * configures them. New RN podspecs default to *included*, which is the safe
 * direction — an over-broad glob costs a lint failure that names the file, while
 * an under-broad one silently loses a transitive dependency.
 */
const RN_DIR = dirname(
  execFileSync('node', ['--print', "require.resolve('react-native/package.json')"], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim(),
);

/**
 * Podspecs that configure themselves from an env var this gate does not set.
 * See the note above — adding to this list is safe; removing from it re-opens
 * the "Missing required attribute `source`" failure.
 */
const NOT_PODS = new Set(['React-Core-prebuilt', 'ReactNativeDependencies']);

function localPodspecs(dir, found = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) localPodspecs(p, found);
    else if (e.name.endsWith('.podspec')) found.push(p);
  }
  return found;
}

/** `React.podspec` -> `React`; matches CocoaPods' own `File.basename(p, '.*')`. */
const podNameOf = (p) => basename(p, '.podspec');

const allRnPodspecs = localPodspecs(RN_DIR);
if (allRnPodspecs.length === 0) {
  console.error(
    `Found no .podspec files under ${RN_DIR}.\n` +
      '  `npm ci` has to run before this gate: see .github/workflows/ci.yml.',
  );
  process.exit(2);
}

const rnPodspecs = allRnPodspecs.filter((p) => !NOT_PODS.has(podNameOf(p)));
const excluded = allRnPodspecs.filter((p) => NOT_PODS.has(podNameOf(p)));

console.log(
  `[pod] ${rnPodspecs.length} local React Native podspecs from ${RN_DIR}` +
    (excluded.length ? ` (${excluded.length} excluded: ${excluded.map(podNameOf).join(', ')})` : ''),
);

// `--external-podspecs` arrived in CocoaPods 1.7.0.beta.3, so this is a floor
// rather than a real constraint. It is still worth checking, because the
// failure mode without it is a CLAide "Unknown option" buried in a lint run
// that has already downloaded React Native twice, and a contributor hitting it
// would reasonably conclude the flag is wrong rather than the tool is old.
const help = spawnSync(pod, [...prefix, 'lib', 'lint', '--help'], {
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
  cwd: ROOT,
});
const helpText = `${help.stdout || ''}${help.stderr || ''}`;
// Only judge the tool when it actually answered. A `pod` that is missing or
// broken produces no help text, and the lint below reports that far more
// accurately than "CocoaPods is too old" would.
if (helpText.trim() && !helpText.includes('--external-podspecs')) {
  console.error(
    'This CocoaPods does not support `pod lib lint --external-podspecs`, which\n' +
      'this gate needs (added in CocoaPods 1.7.0.beta.3).\n\n' +
      `  ${useBundle ? 'bundle update cocoapods' : 'gem install cocoapods --no-document'}\n` +
      '  pod --version\n',
  );
  process.exit(2);
}

const args = [
  ...prefix,
  'lib', 'lint', PODSPEC,
  '--allow-warnings',
  '--platforms=ios',
  '--no-clean',
  // ONE flag carrying a glob, not one flag per file.
  //
  // CocoaPods declares it as `--external-podspecs=**/*.podspec` and consumes it
  // as a single value: `validator.rb` does
  //   additional_podspec_pods = Dir.glob(external_podspecs)...
  // so it is glob-expanded by Ruby, not by the shell and not by a repeat of the
  // flag. Repeating it once per podspec would leave `external_podspecs` holding
  // only the last value, and the lint would fail with the same "Unable to find
  // a specification" error this flag exists to fix.
  //
  // The glob is anchored at RN's package root and covers the whole tree because
  // the dependency graph is transitive: RCTFabric pulls RCT-Folly, glog, Yoga,
  // React-jsi, hermes-engine, React-Fabric and more, and a hand-kept list of
  // "the ones we need" is silently short on the next RN version.
  //
  // Forward slashes are fine on Windows too — the gate is macOS-only, but
  // Dir.glob wants one separator.
  `--external-podspecs=${RN_DIR.replace(/\\/g, '/')}/**/*.podspec`,
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
  // "Re-run once" was the wrong advice and cost a cycle: this gate is a build,
  // and a build that fails on a `prepare_command` 20 minutes in fails the same
  // way every time. `--no-clean` is set above, so the workspace CocoaPods left
  // behind is named in the output above and is worth reading — the sources are
  // all there, and so is the reason.
  console.error(
    '[pod] lib lint failed. This is the only thing in the repo that has ever\n' +
      '      compiled the Swift, so treat it as a real finding rather than a\n' +
      '      flaky job. The lint is deterministic; re-running it will not help.\n\n' +
      '      Read the error above before anything else. Two shapes are about\n' +
      '      React Native rather than this repo:\n\n' +
      '        "The `<pod>` pod failed to validate" / "Missing required\n' +
      '         attribute `source`"\n' +
      '          A pod whose s.source comes from resolve_podspec_source(). The two\n' +
      '          prebuilt-distribution podspecs are excluded above; if the name\n' +
      '          is a different one, a new RN release added a third. Add it to\n' +
      '          NOT_PODS and note why in the comment there.\n\n' +
      '        a shell error from a third-party podspec\n' +
      '          `mv src double-conversion` is DoubleConversion.podspec\'s\n' +
      '          prepare_command and means that pod was installed from a directory\n' +
      '          rather than from its s.source, i.e. via :path and not :podspec.\n' +
      '          That was the old --include-podspecs; see the note above.\n\n' +
      '      For compiler output, add --verbose.',
  );
  process.exit(r.status ?? 1);
}
console.log('[pod] OK — podspec is well-formed and the Swift compiles');
