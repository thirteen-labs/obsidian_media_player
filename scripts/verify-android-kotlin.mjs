#!/usr/bin/env node
/**
 * Local Kotlin type-check for the Android module. No NDK, no CMake, no Gradle,
 * no emulator, no host app.
 *
 * ## Why this exists
 *
 * `to-be-done.md` FG-0.6: nothing in this repository has ever compiled the
 * Android module. `0.3.0` shipped two hard Kotlin compile errors, and the only
 * reason either was found is that a person read the source. The Gradle build
 * aborts at `configureCMakeRelWithDebInfo` before `compileReleaseKotlin` runs,
 * so *any* Kotlin error is invisible while the native build is broken — and the
 * full build needs an NDK, a host app for autolinking, and a device.
 *
 * This script closes the Kotlin half of that gap in ~90 seconds: it resolves the
 * real dependency jars, extracts `classes.jar` out of each AAR, and runs the
 * Kotlin compiler over `android/src/main/java`. It catches every class of error
 * that matters before code review — unresolved references, wrong overrides,
 * arity, nullability, deprecated API.
 *
 * What it does NOT catch, and never will: manifest merging, resource linking,
 * CMake/NDK compilation of `OnLoad.cpp`, and anything about runtime behaviour.
 * The Gradle CI job in FG-0.6 is still required. This is the fast inner loop.
 *
 * ## Usage
 *
 *   node scripts/verify-android-kotlin.mjs            # full matrix
 *   node scripts/verify-android-kotlin.mjs 0.80.0     # one version
 *
 * Requires: Node 18+, a JDK 17+ on PATH, and an Android SDK with
 * `platforms/android-35` (set ANDROID_HOME, or it falls back to the default
 * Windows/macOS/Linux locations).
 *
 * ## Why the version matrix
 *
 * `react-native` is a peer dependency, so the module is compiled by whatever the
 * consuming app resolves. A single-version check is a lie: the code compiled
 * clean against 0.74 and 0.80 while failing outright against 0.73, which is
 * exactly the kind of gap a single check hides. The matrix is the point.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(tmpdir(), 'omp-kotlin-verify');

/** Pinned to the versions in android/build.gradle. */
const MEDIA3 = '1.3.1';
const ANDROIDX_CORE = '1.12.0';
const ANDROIDX_MEDIA = '1.7.0';
const FBJNI = '0.3.0';
const PLATFORM = '35';

/**
 * RN version -> Kotlin version needed to read its metadata.
 * RN 0.78+ is published with Kotlin 2.x metadata, which a 1.9 compiler refuses
 * to read ("binary version of its metadata is 2.1.0, expected version is 1.9.0").
 */
const MATRIX = [
  { rn: '0.74.0', kotlin: '1.9.24' },
  { rn: '0.80.0', kotlin: '2.1.0' },
];

const CENTRAL = 'https://repo1.maven.org/maven2';
const GOOGLE = 'https://dl.google.com/dl/android/maven2';

const ARTIFACTS = [
  `org.jetbrains.kotlin:kotlin-compiler-embeddable:{KV}:kotlin-compiler-embeddable-{KV}.jar|${CENTRAL}`,
  `org.jetbrains.kotlin:kotlin-stdlib:{KV}:kotlin-stdlib-{KV}.jar|${CENTRAL}`,
  `org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm:{CV}:kotlinx-coroutines-core-jvm-{CV}.jar|${CENTRAL}`,
  `org.jetbrains.intellij.deps:trove4j:1.0.20200330:trove4j-1.0.20200330.jar|${CENTRAL}`,
  `org.jetbrains:annotations:23.0.0:annotations-23.0.0.jar|${CENTRAL}`,
  `com.facebook.react:react-android:{RN}:react-android-{RN}-release.aar|${CENTRAL}`,
  `com.facebook.fbjni:fbjni:${FBJNI}:fbjni-${FBJNI}.aar|${CENTRAL}`,
  `androidx.media3:media3-common:${MEDIA3}:media3-common-${MEDIA3}.aar|${GOOGLE}`,
  `androidx.media3:media3-exoplayer:${MEDIA3}:media3-exoplayer-${MEDIA3}.aar|${GOOGLE}`,
  `androidx.media3:media3-exoplayer-dash:${MEDIA3}:media3-exoplayer-dash-${MEDIA3}.aar|${GOOGLE}`,
  `androidx.media3:media3-exoplayer-hls:${MEDIA3}:media3-exoplayer-hls-${MEDIA3}.aar|${GOOGLE}`,
  `androidx.media3:media3-session:${MEDIA3}:media3-session-${MEDIA3}.aar|${GOOGLE}`,
  `androidx.media3:media3-datasource:${MEDIA3}:media3-datasource-${MEDIA3}.aar|${GOOGLE}`,
  `androidx.media3:media3-database:${MEDIA3}:media3-database-${MEDIA3}.aar|${GOOGLE}`,
  `androidx.media3:media3-extractor:${MEDIA3}:media3-extractor-${MEDIA3}.aar|${GOOGLE}`,
  `androidx.core:core:${ANDROIDX_CORE}:core-${ANDROIDX_CORE}.aar|${GOOGLE}`,
  `androidx.media:media:${ANDROIDX_MEDIA}:media-${ANDROIDX_MEDIA}.aar|${GOOGLE}`,
  // FG-4.0/4.1: MediaSession.Callback overrides return ListenableFuture, so the
  // gate needs guava on the compile classpath (Gradle gets it transitively
  // from media3-session; this harness resolves jars by hand).
  `com.google.guava:guava:32.1.2-android:guava-32.1.2-android.jar|${CENTRAL}`,
];

/** The 2.x compiler needs coroutines on its own classpath; 1.9 tolerates 1.8.x. */
const coroutinesFor = (kotlin) => (kotlin.startsWith('2.') ? '1.10.2' : '1.8.1');

/** Recursive .class probe — kotlinc writes into package subdirectories. */
function hasClassFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (hasClassFiles(join(dir, e.name))) return true;
    } else if (e.name.endsWith('.class')) {
      return true;
    }
  }
  return false;
}

const log = (...a) => console.log(...a);

function sdkRoot() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    join(homedir(), 'Android', 'Sdk'),
    '/usr/local/lib/android/sdk',
  ].filter(Boolean);
  const found = candidates.find((c) => existsSync(join(c, 'platforms')));
  if (!found) {
    console.error(
      'Could not find an Android SDK. Set ANDROID_HOME to a directory containing\n' +
        `  platforms/android-${PLATFORM}/\n` +
        'Install it with: sdkmanager "platforms;android-35"',
    );
    process.exit(2);
  }
  return found;
}

function download(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const args = ['-sS', '-L', '--retry', '3', '--max-time', '900', '-o', dest, url];
  // Schannel (Windows) fails the TLS revocation check on some CI networks.
  if (process.platform === 'win32') args.splice(1, 0, '--ssl-no-revoke');
  const r = spawnSync('curl', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`curl failed (${r.status}) for ${url}\n${r.stderr || ''}`);
  return dest;
}

/**
 * Maven Central intermittently answers a 200 with a 25-byte
 * "Upstream request failed." body, and curl reports success. Validate before
 * use, or the next step fails deep inside tar with an unrelated message.
 */
function isUsable(file) {
  if (!existsSync(file)) return false;
  const size = statSync(file).size;
  if (size < 2048) return false;
  const head = readFileSync(file).subarray(0, 2).toString('latin1');
  // jar/aar are both zip: starts with "PK". A .pom or .module is XML.
  if (!file.endsWith('.pom') && !file.endsWith('.module') && head !== 'PK') return false;
  return true;
}

/** Download with a retry, and fall back to the Apache mirror of Central. */
function fetch(repo, path, dest) {
  if (isUsable(dest)) return dest;
  const urls = [`${repo}/${path}`];
  if (repo === CENTRAL) urls.push(`https://repo.maven.apache.org/maven2/${path}`);

  let lastErr;
  for (const url of urls) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        rmSync(dest, { force: true });
        download(url, dest);
        if (isUsable(dest)) return dest;
        lastErr = `${url} returned a ${statSync(dest).size}-byte body`;
      } catch (e) {
        lastErr = e.message;
      }
      if (attempt < 3) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},2000)']);
    }
  }
  throw new Error(`Could not download ${path}\n  ${lastErr}`);
}

/** Unzip just `classes.jar` out of an AAR. */
function extractClasses(aarPath, outJar) {
  const work = `${aarPath}.x`;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  execFileSync(
    process.platform === 'win32' ? 'tar' : 'unzip',
    process.platform === 'win32'
      ? ['-xf', aarPath, '-C', work]
      : ['-q', aarPath, 'classes.jar', '-d', work],
    { stdio: 'ignore' },
  );
  const inner = join(work, 'classes.jar');
  if (!existsSync(inner)) {
    throw new Error(`No classes.jar inside ${aarPath} — is this really an AAR?`);
  }
  writeFileSync(outJar, readFileSync(inner));
  rmSync(work, { recursive: true, force: true });
  return outJar;
}

function kotlinSources() {
  const base = join(ROOT, 'android', 'src', 'main', 'java');
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.kt')) out.push(p);
    }
  };
  walk(base);
  if (out.length === 0) throw new Error(`No .kt files under ${base}`);
  return out;
}

function compile({ rn, kotlin }) {
  const jars = join(CACHE, 'cp');
  mkdirSync(jars, { recursive: true });
  const cv = coroutinesFor(kotlin);

  for (const spec of ARTIFACTS) {
    const [coords, repo] = spec.split('|');
    const [group, artifact, versionTpl, fileTpl] = coords.split(':');
    const sub = (s) => s.replace(/\{KV\}/g, kotlin).replace(/\{RN\}/g, rn).replace(/\{CV\}/g, cv);
    const version = sub(versionTpl);
    const file = sub(fileTpl);
    const local = join(CACHE, 'dl', file);
    if (!isUsable(local)) {
      const path = `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`;
      process.stdout.write(`  fetching ${file} ... `);
      fetch(repo, path, local);
      log(`${(statSync(local).size / 1048576).toFixed(1)}MB`);
    }
    const jar = join(jars, `${artifact}-${version}.jar`);
    if (file.endsWith('.aar')) {
      if (!existsSync(jar)) extractClasses(local, jar);
    } else if (!existsSync(jar)) {
      // The compiler jar lives here too; it is filtered back out of the -cp
      // below and used only on the launch classpath.
      writeFileSync(jar, readFileSync(local));
    }
  }

  const androidJar = join(sdkRoot(), 'platforms', `android-${PLATFORM}`, 'android.jar');
  const platformJar = join(jars, `android-${PLATFORM}.jar`);
  if (!existsSync(platformJar)) writeFileSync(platformJar, readFileSync(androidJar));

  // Every jar in cp/, minus the ones that must match the compiler version, and
  // minus every react-android jar — the target's own is appended below.
  //
  // Both exclusions are load-bearing. A cached kotlin-stdlib 2.x poisons a 1.9
  // target with "binary version of its metadata is 2.1.0, expected 1.9.0", and a
  // cached react-android 0.80 does the same to the 0.74 target. Since the cache
  // is shared across runs, a single-version run after a full matrix run hits
  // both.
  const cp = readdirSync(jars)
    .filter((f) => f.endsWith('.jar')
      && !f.startsWith('kotlin-compiler-embeddable')
      && !f.startsWith('kotlin-stdlib-')
      && !f.startsWith('kotlinx-coroutines-core-jvm-')
      && !f.startsWith('trove4j')
      && !f.startsWith('react-android-'))
    .map((f) => join(jars, f))
    .concat([
      join(jars, `kotlin-stdlib-${kotlin}.jar`),
      join(jars, `react-android-${rn}.jar`),
    ])
    .join(delimiter);

  const launch = [
    join(jars, `kotlin-compiler-embeddable-${kotlin}.jar`),
    join(jars, `kotlin-stdlib-${kotlin}.jar`),
    join(jars, `kotlinx-coroutines-core-jvm-${cv}.jar`),
    join(jars, 'annotations-23.0.0.jar'),
    join(jars, 'trove4j-1.0.20200330.jar'),
  ].join(delimiter);

  const outDir = join(CACHE, 'out', `${rn}-${kotlin}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const r = spawnSync(
    'java',
    ['-cp', launch, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      '-no-stdlib', '-nowarn', '-cp', cp, '-d', outDir, ...kotlinSources()],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  const text = `${r.stdout || ''}${r.stderr || ''}`;
  const errors = text
    .split(/\r?\n/)
    .filter((l) => l.includes(': error: ') || l.startsWith('error: '))
    .map((l) => l.replace(ROOT + '\\', '').replace(ROOT + '/', '').replace(/\s+/g, ' ').trim());

  // A compiler that fails to launch prints "Could not find or load main class"
  // and exits non-zero. Without this check that reads as "zero errors" and the
  // gate reports OK for a build that never happened — which is worse than no
  // gate at all, because it is trusted. Require proof of work: exit 0 *and*
  // class files on disk.
  const producedClasses = hasClassFiles(outDir);
  if (r.error || r.status !== 0 || !producedClasses) {
    const detail = (text.trim() || `java exited ${r.status} with no output`).split(/\r?\n/)[0];
    const out = [
      `KOTLIN COMPILER FAILED TO RUN (status=${r.status}) — this is a harness bug, not a source error.`,
      `  ${detail}`,
    ];
    // "Could not find or load main class" means the launch classpath did not
    // reach java as a list of jars, and the overwhelmingly common cause is the
    // separator. java splits -cp on path.delimiter: ';' on Windows, ':'
    // everywhere else. Hardcoding ';' works on a Windows dev box and fails on
    // every CI runner, with a message that reads like a missing JDK — which is
    // exactly how it was misdiagnosed the first time. So name it here.
    if (/Could not find or load main class|Could not find or load main/.test(text)) {
      out.push(
        '  java could not load the compiler class, so the launch classpath was not',
        `  understood. It is joined with path.delimiter (${JSON.stringify(delimiter)} on`,
        '  this host) — if that is wrong for the platform java is running on, the',
        '  whole string is read as ONE filename.',
      );
    } else {
      out.push('  Check that a JDK 17+ is on PATH and that the compiler jar was cached.');
    }
    out.push(`  launch -cp was: ${launch}`);
    return out;
  }

  return [...new Set(errors)];
}

const requested = process.argv[2];
const targets = requested
  ? MATRIX.filter((m) => m.rn === requested)
  : MATRIX;

if (targets.length === 0) {
  console.error(`Unknown version "${requested}". Known: ${MATRIX.map((m) => m.rn).join(', ')}`);
  process.exit(2);
}

log(`Kotlin type-check — ${kotlinSources().length} files, android-${PLATFORM}, media3 ${MEDIA3}`);
log(`Cache: ${CACHE}\n`);

let failed = 0;
for (const t of targets) {
  process.stdout.write(`react-android ${t.rn} (kotlin ${t.kotlin}) ... `);
  const errors = compile(t);
  if (errors.length === 0) {
    log('OK');
  } else {
    failed++;
    log(`FAILED — ${errors.length} error(s)`);
    for (const e of errors) log(`    ${e}`);
  }
}

log('');
if (failed) {
  log(`${failed}/${targets.length} target(s) failed.`);
  process.exit(1);
}
log(`All ${targets.length} target(s) compile.`);
