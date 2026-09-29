#!/usr/bin/env node
/**
 * FG-0.6 step 5: prove each gate actually goes red.
 *
 * > "A gate that has never failed is not a gate."
 *
 * This script injects a known-bad change into each gate's input, asserts the
 * gate exits non-zero *for the right reason*, then restores the file. It is the
 * same discipline already applied by hand to `verify:android` and to the
 * regression tests, turned into something runnable.
 *
 * ## Asserting the reason, not just the exit code
 *
 * A gate that fails because `npm` is missing has proven nothing about the code.
 * Every probe therefore declares a signature the output must match, so a
 * "red for the wrong reason" run is reported as a failure of this script rather
 * than as a passing self-test. `verify:android` already distinguishes a harness
 * bug (exit 2) from a source error (exit 1) for the same reason.
 *
 * ## Safety
 *
 * Probes are additive files wherever possible, so a real source file is almost
 * never touched. The two exceptions (`src/index.ts` for the web bundle, and
 * `android/CMakeLists.txt` for the CMake probe) are backed up and restored in a
 * `finally`, and the script refuses to start if the tree is already dirty in a
 * way that would make a restore ambiguous.
 *
 * ## Usage
 *
 *   node scripts/ci/gate-self-test.mjs             # fast gates (JS + Kotlin)
 *   node scripts/ci/gate-self-test.mjs --full      # + Gradle host build + pod lint
 *   node scripts/ci/gate-self-test.mjs --only=bundle
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FULL = process.argv.includes('--full');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** Run a gate, capturing output. Returns { status, output }. */
function gate(args, { cwd = ROOT, timeout = 15 * 60 * 1000 } = {}) {
  const r = spawnSync(npm, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
    timeout,
    env: { ...process.env, CI: '1' },
  });
  return { status: r.status, output: `${r.stdout || ''}${r.stderr || ''}` };
}

/**
 * A probe is: a set of mutations to apply, a gate to run, and the signature that
 * proves the failure is the one we injected. `restore` runs in a `finally`
 * whatever happens, so an interrupted run cannot leave a broken tree.
 */
const PROBES = [
  {
    id: 'typecheck',
    gate: 'npm run typecheck',
    why: 'a type error in src/ must break tsc',
    expect: /error TS\d+/,
    apply: () => ({
      file: 'src/__gate_probe__.ts',
      cleanup: true,
      write: [
        '// Injected by scripts/ci/gate-self-test.mjs — deleted on completion.',
        'export const gateProbe: number = "not a number";',
        '',
      ].join('\n'),
    }),
  },
  {
    id: 'lint',
    gate: 'npm run lint',
    why: 'a parse error in src/ must break eslint',
    expect: /Parsing error|error\s+.*gateProbe/i,
    apply: () => ({
      file: 'src/__gate_probe__.tsx',
      cleanup: true,
      write: '// Injected by scripts/ci/gate-self-test.mjs\nexport const = ;\n',
    }),
  },
  {
    id: 'test',
    gate: 'npm test',
    why: 'a failing assertion must break jest',
    expect: /gate probe/i,
    apply: () => ({
      file: '__tests__/gate-probe.test.ts',
      cleanup: true,
      write: [
        "// Injected by scripts/ci/gate-self-test.mjs — deleted on completion.",
        "it('fails on purpose (gate probe)', () => {",
        "  expect('actual').toBe('expected from gate probe');",
        '});',
        '',
      ].join('\n'),
    }),
  },
  {
    id: 'bundle',
    gate: 'npm run bundle:web',
    // The web gate is the one that makes the web build work at all, and it can
    // only fail if something native-only is reachable from the entry point. A new
    // unreferenced file would not be in the graph, so this one edits src/index.ts.
    // A deep `react-native/Libraries/...` import is used rather than a named
    // export because bundle-web.mjs's `alias` rewrites it to a
    // react-native-web path that does not exist — a resolve error, not a warning.
    why: 'a deep native-only import reachable from index.ts must break the web bundle',
    expect: /Could not resolve|No matching export|bundle:web FAILED/i,
    apply: () => {
      const file = 'src/index.ts';
      const original = readFileSync(join(ROOT, file), 'utf8');
      writeFileSync(
        join(ROOT, file),
        `${original}\n// Injected by scripts/ci/gate-self-test.mjs\nexport { default as __gateProbe } from 'react-native/Libraries/EventEmitter/NativeEventEmitter';\n`,
      );
      return { file, original };
    },
  },
  {
    id: 'kotlin',
    gate: 'npm run verify:android -- 0.74.0',
    // The cheapest matrix target. Both are exercised by the real gate; proving the
    // mechanism on one is enough for a self-test, and this keeps it under 2 min.
    why: 'an unresolved reference in a .kt file must break the Kotlin type-check',
    // Deliberately does NOT accept the harness-failure string. A broken harness
    // also exits non-zero, and accepting it here would let this probe pass for
    // exactly the wrong reason it exists to detect.
    expect: /unresolved reference/i,
    apply: () => ({
      file: 'android/src/main/java/com/obsidianmediaplayer/GateProbe.kt',
      cleanup: true,
      write: [
        '// Injected by scripts/ci/gate-self-test.mjs — deleted on completion.',
        'package com.obsidianmediaplayer',
        '',
        'internal object GateProbe {',
        '    fun probe(): NoSuchTypeOnPurpose = NoSuchTypeOnPurpose()',
        '}',
        '',
      ].join('\n'),
    }),
  },
  {
    id: 'gradle-kotlin',
    full: true,
    gate: 'npm run verify:android:host',
    why: 'the same Kotlin error must break the real Gradle build, in autolinking context',
    expect: /e: .*GateProbe|Compilation error|unresolved reference|FAILURE/i,
    apply: () => ({
      file: 'android/src/main/java/com/obsidianmediaplayer/GateProbe.kt',
      cleanup: true,
      write: [
        '// Injected by scripts/ci/gate-self-test.mjs — deleted on completion.',
        'package com.obsidianmediaplayer',
        '',
        'internal object GateProbe {',
        '    fun probe(): NoSuchTypeOnPurpose = NoSuchTypeOnPurpose()',
        '}',
        '',
      ].join('\n'),
    }),
  },
  {
    id: 'gradle-cmake',
    full: true,
    // The CMake/NDK compile of OnLoad.cpp is invisible to every other gate and is
    // the part that shipped broken twice (the prefab opt-in, then the STL
    // mismatch). Linking a package that does not exist fails at configure time.
    gate: 'npm run verify:android:host',
    why: 'a bad find_package/target must break the CMake configure step',
    expect: /NoMatchingLibrary|Could not find|CMake Error|FAILURE/i,
    apply: () => {
      const file = 'android/CMakeLists.txt';
      const original = readFileSync(join(ROOT, file), 'utf8');
      writeFileSync(
        join(ROOT, file),
        `${original}\n# Injected by scripts/ci/gate-self-test.mjs\nfind_package(omp_gate_probe_that_does_not_exist REQUIRED CONFIG)\n`,
      );
      return { file, original };
    },
  },
  {
    id: 'ios-codegen',
    // The one gate that checks the iOS native sources without a Mac. It is fast
    // and platform-independent, so unlike the pod probe it runs in the default
    // set. The mutation is the exact defect the iOS build shipped with: the
    // Swift conformance naming a protocol codegen never emits.
    gate: 'npm run verify:ios',
    why: 'a native protocol name that codegen does not emit must break the iOS gate',
    expect: /swift:no-conformance|mm:conforms|spec:Native/i,
    apply: () => ({
      file: 'ios/Video/ObsidianVideoManager.swift',
      original: readFileSync(join(ROOT, 'ios/Video/ObsidianVideoManager.swift'), 'utf8'),
      write: [
        '// Injected by scripts/ci/gate-self-test.mjs — restored on completion.',
        'import Foundation',
        'extension ObsidianVideoManager: ObsidianVideoSpec {}',
        '',
      ].join('\n'),
    }),
  },
  {
    id: 'pod',
    full: true,
    macOnly: true,
    gate: 'npm run verify:ios:pod',
    why: 'a Swift syntax error must break pod lib lint',
    expect: /error:|failed|GateProbe/i,
    apply: () => ({
      // The podspec globs ios/**\/*.{h,m,mm,swift}, so a new file is enough and no
      // real source is touched.
      file: 'ios/GateProbe.swift',
      cleanup: true,
      write: [
        '// Injected by scripts/ci/gate-self-test.mjs — deleted on completion.',
        'import Foundation',
        'struct GateProbe { this is not valid Swift }',
        '',
      ].join('\n'),
    }),
  },
];

function dirtyFiles() {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.split('\n').filter(Boolean);
}

function runProbe(probe) {
  console.log(`\n=== gate:${probe.id} — ${probe.why}`);
  console.log(`    $ ${probe.gate}`);

  const mutation = probe.apply();
  const target = join(ROOT, mutation.file);
  let failedForWrongReason = false;

  try {
    const { status, output } = gate(probe.gate.split(' ').slice(1), { cwd: ROOT });
    if (status === 0) {
      console.error(
        `    PASSED WHEN IT SHOULD HAVE FAILED (exit 0).\n` +
          '    This gate is not a gate. Either the probe did not reach it, or the\n' +
          '    check it is supposed to perform is not happening.',
      );
      process.exitCode = 1;
      return;
    }
    if (!probe.expect.test(output)) {
      failedForWrongReason = true;
      console.error(
        `    FAILED FOR THE WRONG REASON (exit ${status}, signature ` +
          `${probe.expect} not found in output). A gate that is red because its\n` +
          '    own environment is broken has proven nothing about the code.\n',
      );
      console.error(output.split('\n').slice(-30).join('\n'));
    } else {
      console.log(`    went red as expected (exit ${status})`);
    }
  } finally {
    // Restore. Additive probes are deleted; edits to real files are reverted.
    if (mutation.cleanup) {
      rmSync(target, { force: true });
    } else if (mutation.original !== undefined) {
      writeFileSync(target, mutation.original);
    }
    console.log(`    restored ${mutation.file}`);
  }

  if (failedForWrongReason) process.exitCode = 1;
}

// Refuse to run on a dirty tree: a restore on top of someone's uncommitted edit
// would silently revert their work.
const dirty = dirtyFiles();
if (dirty && dirty.length) {
  console.error(
    'Refusing to run: the working tree has uncommitted changes. This script\n' +
      'rewrites and restores files, and would revert your work on a probe that\n' +
      'is interrupted.\n\n' +
      dirty.map((d) => `  ${d}`).join('\n') +
      '\n\nCommit or stash them, then re-run.',
  );
  process.exit(2);
}

let selected = PROBES.filter((p) => !p.full || FULL);
if (ONLY) selected = selected.filter((p) => p.id === ONLY);
if (!selected.length) {
  console.error(`No probe matches --only=${ONLY}. Known: ${PROBES.map((p) => p.id).join(', ')}`);
  process.exit(2);
}

const skipped = PROBES.filter((p) => p.macOnly && process.platform !== 'darwin');
for (const p of skipped) console.log(`skipping ${p.id} — requires macOS`);

console.log(`Gate self-test — ${selected.length} probe(s)${FULL ? ' (full)' : ' (fast)'}`);
for (const probe of selected) runProbe(probe);

if (process.exitCode) {
  console.error('\nGATE SELF-TEST FAILED — see above.');
} else {
  console.log('\nAll selected gates go red on a known-bad input, and the tree is restored.');
}
