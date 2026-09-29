#!/usr/bin/env node
/**
 * FG-0.6 step 1: build the Android module for real, with Gradle, in autolinking
 * context. This is the gate that `verify:android` explicitly does not replace.
 *
 * ## Why a host app has to be scaffolded
 *
 * `android/build.gradle` resolves `ndkVersion`, `compileSdkVersion`, `minSdkVersion`,
 * `targetSdkVersion` and `reactNativeArchitectures` from `rootProject.ext` /
 * `rootProject` properties. There is no such thing as a standalone build of this
 * module — the failure mode is that the Kotlin compile is never reached at all,
 * because Gradle aborts during configuration (the CMake/prefab/STL chain that
 * took two shipped releases to diagnose). Building it inside a real RN app is
 * the only honest reproduction of what a consumer gets.
 *
 * We scaffold a throwaway host app rather than checking `example/android/` in.
 * The native project is ~25 files of generated boilerplate that has to be kept in
 * sync with every RN template change, and a stale checked-in copy would test
 * nothing except its own staleness. Scaffolding from the published template means
 * the gate tests the current template plus this module.
 *
 * ## What this covers that `verify:android` does not
 *
 *   - manifest merging (the FOREGROUND_SERVICE_MEDIA_PLAYBACK fix, FG-0.1)
 *   - resource linking
 *   - the CMake/NDK compilation of `OnLoad.cpp`, including the
 *     `-DANDROID_STL=c++_shared` fix and the `prefab = true` opt-in
 *   - the autolinking wiring itself (`react-native.config.js` -> Gradle project)
 *   - codegen for the Fabric component spec
 *
 * ## Usage
 *
 *   node scripts/ci/verify-android-host.mjs
 *   node scripts/ci/verify-android-host.mjs --rn 0.80.0
 *   node scripts/ci/verify-android-host.mjs --keep     # leave the app on disk
 *
 * Requires: Node 18+, JDK 17, an Android SDK with the platform the RN template
 * asks for, and CMake 3.22.1 (installed by CI, see .github/workflows/ci.yml).
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkSdk, gradleProjectName, requiredPackages, sdkRootCandidates,
} from './android-sdk-preflight.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The advertised floor. One full Gradle build is expensive; the Kotlin half of
 *  the version matrix is already covered, much faster, by verify:android. */
const DEFAULT_RN = '0.74.7';

/** CLI major that shipped with the RN version above. `react-native init` was
 *  removed from `react-native` in 0.76, so pin the community CLI instead. */
const CLI_FOR_RN = (rn) => (rn.startsWith('0.74') ? '14.1.2' : 'latest');

const log = (...a) => console.log('[host]', ...a);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${r.status ?? r.signal}`);
  }
}

/**
 * Positive proof of work. `verify:android` learned this the hard way: its first
 * version reported OK for a build that never ran, because a missing compiler jar
 * made `java` exit with "Could not find or load main class", which matched no
 * error pattern and read as "zero errors". Exit 0 is not evidence. The AAR on
 * disk is.
 */
function findAar(moduleDir) {
  const out = join(moduleDir, 'android', 'build', 'outputs', 'aar');
  if (!existsSync(out)) return null;
  const aars = readdirSync(out).filter((f) => f.endsWith('.aar'));
  return aars.length ? join(out, aars[0]) : null;
}

const rnVersion = arg('rn', DEFAULT_RN);
const keep = hasFlag('keep');
const hostDir = join(tmpdir(), 'omp-host-app');
const appName = 'OmpHost';

rmSync(hostDir, { recursive: true, force: true });
mkdirSync(hostDir, { recursive: true });

// 1. Scaffold. --skip-install so npm runs once, against a package.json we control.
run('npx', [
  '--yes', `@react-native-community/cli@${CLI_FOR_RN(rnVersion)}`,
  'init', appName,
  '--version', rnVersion,
  '--skip-install',
  '--skip-git-init',
  '--pm', 'npm',
], { cwd: hostDir });

const appDir = join(hostDir, appName);
if (!existsSync(join(appDir, 'android'))) {
  throw new Error(`scaffold produced no android/ directory in ${appDir}`);
}

// 1b. SDK preflight. See scripts/ci/android-sdk-preflight.mjs for why this has
// to happen before the (slow) npm install rather than being left to AGP.
const required = requiredPackages(readFileSync(join(appDir, 'android', 'build.gradle'), 'utf8'));
const sdkRoot = sdkRootCandidates(process.env, homedir())
  .find((c) => existsSync(c));
const preflight = checkSdk({ sdkRoot, required, exists: existsSync });
if (!preflight.ok) throw new Error(preflight.message);
log(preflight.message);

// 2. Depend on this module from the host. A `file:` dependency is what a consumer
//    does, and it keeps the autolinker on the same code path as node_modules.
//
// The name is read from this package's own package.json rather than written
// down. It used to be a literal 'obsidian-media-player' in three places, which
// meant renaming the package broke the gate in a way that looked like a Gradle
// or autolinking problem instead of a stale string.
const PKG_NAME = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name;
const hostPkgPath = join(appDir, 'package.json');
const hostPkg = JSON.parse(readFileSync(hostPkgPath, 'utf8'));
hostPkg.dependencies[PKG_NAME] = `file:${ROOT}`;
writeFileSync(hostPkgPath, `${JSON.stringify(hostPkg, null, 2)}\n`);

// 3. Install. The module's own `prepare` script (bob build) runs here because npm
//    treats a file: dependency as needing a build; that is what a consumer gets.
run('npm', ['install', '--no-audit', '--no-fund'], { cwd: appDir });

// npm installs a directory `file:` dependency as a symlink. That is intentional
// and desirable here: it means Gradle compiles *this checkout*, not a copy, so
// the gate tests the working tree and the self-test's probes are picked up.
// A symlinked path is fine for Gradle's find_package because it resolves through.
//
// Scoped names land under node_modules/@scope/name, and PKG_NAME already carries
// the scope, so splitting on '/' is both necessary and sufficient.
const moduleDir = join(appDir, 'node_modules', ...PKG_NAME.split('/'));
if (!existsSync(join(moduleDir, 'android', 'build.gradle'))) {
  throw new Error(
    `the file: dependency did not resolve into the host app at ${moduleDir}.\n` +
      'Autolinking will have nothing to configure.',
  );
}

// 4. The build. One ABI: the ABI list only multiplies NDK work and proves nothing
//    extra about this module. `assembleRelease` covers Kotlin *and* the CMake/NDK
//    compile of OnLoad.cpp, which is the part `verify:android` cannot see. It also
//    covers manifest merging, which is where the FG-0.1 permission fix is verified.
//
// The Gradle project name is NOT the package name. The autolinker derives it in
// native_modules.gradle:
//
//   nameCleansed = name.replaceAll('[~*!\u0027()]+', '_').replaceAll('^@([\\w-.]+)/', '$1_')
//
// so a scope is rewritten to `scope_` and a `/` becomes part of the same token:
// `@obsidian_north/media-player` -> `:obsidian_north_media-player`. Hardcoding
// `:obsidian-media-player` here would make every Gradle invocation fail with
// "project with path ':obsidian-media-player' could not be found", which reads
// like a broken autolinking setup rather than a stale string in this script.
const GRADLE_PROJECT = `:${gradleProjectName(PKG_NAME)}`;
log(`Gradle project: ${GRADLE_PROJECT} (package ${PKG_NAME})`);
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, [
  `${GRADLE_PROJECT}:assembleRelease`,
  '-PreactNativeArchitectures=arm64-v8a',
  '--no-configuration-cache',
  '--stacktrace',
], { cwd: join(appDir, 'android') });

const aar = findAar(moduleDir);
if (!aar) {
  throw new Error(
    'assembleRelease exited 0 but produced no AAR. As with verify:android, exit 0 ' +
      'is not evidence — the gate needs positive proof of work.',
  );
}
log(`AAR: ${aar} (${statSync(aar).size} bytes)`);

if (!keep) rmSync(hostDir, { recursive: true, force: true });
else log(`kept host app at ${hostDir}`);

log('OK — manifest merged, resources linked, OnLoad.cpp compiled, AAR produced');
