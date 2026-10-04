#!/usr/bin/env node
/**
 * Codegen command-name gate. Two checks, both of which used to be invisible.
 *
 * ---------------------------------------------------------------------------
 * 1. Duplicate method signatures in the generated Android view-manager interface
 * ---------------------------------------------------------------------------
 * `GeneratePropsJavaInterface.js` builds ONE interface out of two lists and
 * joins them with no de-duplication:
 *
 *   props    ->  `void set<PascalCase(propName)>(T view, <type> value);`
 *   commands ->  `void <commandName>(T view, <argTypes...>);`
 *
 * So a command named `setRate` and a prop named `rate` both emit
 * `void setRate(T, double)` and javac rejects the interface. The failure lands
 * in the CONSUMING APP's `compileReleaseJavaWithJavac`, not here, because the
 * generated interface is written into the app's codegen source set — which is
 * why it survived every local gate and only appeared via
 * `verify:android:host`, a job that scaffolds a throwaway RN host and runs a
 * full Gradle `assembleRelease` (60-minute budget, NDK download, etc.).
 *
 * `setRate`/`setVolume`/`setMuted`/`setResizeMode` were all declared both as
 * props and as commands, so all four collided and that job went red. The
 * commands are now `apply*`; see src/specs/NativeObsidianVideo.ts for the rule.
 *
 * This regenerates the real artifacts with the same script Gradle calls and
 * fails on any repeated signature, so the class of bug is caught in seconds
 * instead of one CI cycle from now.
 *
 * ---------------------------------------------------------------------------
 * 2. Android `getCommandsMap()` drift
 * ---------------------------------------------------------------------------
 * `verify-ios-codegen.mjs` derives its command checks from `supportedCommands`,
 * so iOS cannot drift. Android had no equivalent: `getCommandsMap()` and both
 * `receiveCommand` branches are hand-maintained strings that codegen resolves
 * a dispatch against. A rename applied to the spec and iOS but missed in Kotlin
 * fails silently at runtime — the command is dispatched to a manager that
 * answers no such command — and no compile error anywhere. This asserts the
 * Kotlin keys are exactly the spec's `supportedCommands`.
 *
 * ## Usage
 *
 *   node scripts/verify-codegen-commands.mjs
 *
 * Requires `node_modules` (react-native is a devDependency). No JDK, no Android
 * SDK, no Gradle, no network.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SPEC = join(ROOT, 'src', 'specs', 'NativeObsidianVideo.ts');
const KOTLIN = join(
  ROOT, 'android', 'src', 'main', 'java', 'com', 'obsidianmediaplayer',
  'video', 'ObsidianVideoManager.kt',
);
const GENERATOR = join(ROOT, 'node_modules', 'react-native', 'scripts', 'generate-codegen-artifacts.js');

const problems = [];
const log = (...a) => console.log(...a);
const fail = (id, msg) => problems.push(`${id}: ${msg}`);

/** Splits on commas that are not inside <> or (), so generics survive. */
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '<' || ch === '(') depth++;
    else if (ch === '>' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/**
 * A generated interface declaration is always `Type name(params);` on one line,
 * optionally with `@Nullable` on the params. Parameter names are irrelevant to
 * javac's duplicate check — it compares name plus erased types — so the type is
 * taken as the second-to-last token and the name dropped.
 */
function javaSignatures(src) {
  const decl = /^[ \t]*(?:@\w+[ \t]+)*[A-Za-z_][\w$.<>\[\], \t]*?[ \t]+(\w+)\(([^)]*)\)[ \t]*;/gm;
  const sigs = [];
  for (const m of src.matchAll(decl)) {
    const types = splitTopLevel(m[2]).map((p) => {
      const tokens = p.replace(/@\w+/g, ' ').trim().split(/\s+/);
      return tokens.length >= 2 ? tokens[tokens.length - 2] : tokens[0];
    });
    sigs.push({ key: `${m[1]}(${types.join(',')})`, text: m[0].trim() });
  }
  return sigs;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.java')) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Regenerate and look for duplicate signatures.
// ---------------------------------------------------------------------------

if (!existsSync(GENERATOR)) {
  fail('codegen', `${relative(ROOT, GENERATOR)} is missing — run \`npm ci\` first`);
}

let interfaces = [];
if (existsSync(GENERATOR)) {
  // Gradle resolves this to <app>/android/app/build/generated/source/codegen,
  // so mirror that shape rather than writing into the repo.
  const out = mkdtempSync(join(tmpdir(), 'omp-codegen-verify-'));
  try {
    const r = spawnSync(
      process.execPath,
      [GENERATOR, '--path', ROOT, '--outputPath', join(out, 'android'), '--targetPlatform', 'android'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    if (r.status !== 0) {
      const detail = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/).slice(-5).join('\n    ');
      fail('codegen', `generate-codegen-artifacts.js exited ${r.status}\n    ${detail}`);
    } else {
      // Windows separators: `join` yields backslashes, so normalise before
      // matching a path segment.
      //
      // The contents are read HERE, not after the `finally` below deletes the
      // temp dir — reading paths afterwards throws ENOENT.
      interfaces = walk(out)
        .filter((f) => f.replace(/\\/g, '/').includes('/viewmanagers/'))
        .map((f) => ({ file: relative(out, f), src: readFileSync(f, 'utf8') }));
      if (interfaces.length === 0) {
        fail(
          'codegen',
          'no view-manager interfaces were generated, so there was nothing to check. ' +
            'A gate that passes because it inspected zero files is worse than no gate.',
        );
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

let duplicateCount = 0;
for (const { file, src } of interfaces) {
  const sigs = javaSignatures(src);
  const seen = new Map();
  for (const s of sigs) {
    if (seen.has(s.key)) {
      duplicateCount++;
      fail(
        'duplicate-signature',
        `${file}\n` +
          `      ${s.key} is declared twice:\n` +
          `        line A: ${seen.get(s.key)}\n` +
          `        line B: ${s.text}\n` +
          `      A command may not be named \`set\` + PascalCase of any prop name — the\n` +
          `      prop and the command both generate \`set<Name>\`. Rename the command.`,
      );
    } else {
      seen.set(s.key, s.text);
    }
  }
}

const checked = interfaces.length;
log(
  duplicateCount === 0
    ? `codegen: ${checked} generated interface(s), no duplicate signatures`
    : `codegen: ${duplicateCount} duplicate signature(s) in ${checked} interface(s)`,
);

// ---------------------------------------------------------------------------
// 2. Kotlin getCommandsMap() must equal supportedCommands.
// ---------------------------------------------------------------------------

const specSrc = readFileSync(SPEC, 'utf8');
const block = specSrc.match(/supportedCommands:\s*\[([\s\S]*?)\]/);
if (!block) {
  fail('android:commands', 'could not find supportedCommands in NativeObsidianVideo.ts');
} else {
  const commands = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  const mapBlock = readFileSync(KOTLIN, 'utf8').match(/getCommandsMap\(\)[\s\S]*?mutableMapOf\(([\s\S]*?)\)/);
  if (!mapBlock) {
    fail('android:commands', 'could not find getCommandsMap() in ObsidianVideoManager.kt');
  } else {
    const kotlin = new Map([...mapBlock[1].matchAll(/"([^"]+)"\s+to\s+\d+/g)].map((m) => [m[1], true]));

    for (const cmd of commands) {
      if (!kotlin.has(cmd)) {
        fail(
          'android:commands',
          `supportedCommands lists "${cmd}" but getCommandsMap() has no such key. ` +
            'Codegen resolves a dispatch against this map, so the command would be ' +
            'silently dropped at runtime.',
        );
      }
    }
    for (const key of kotlin.keys()) {
      if (!commands.includes(key)) {
        fail(
          'android:commands',
          `getCommandsMap() declares "${key}" but supportedCommands does not list it. ` +
            'The command can never be dispatched.',
        );
      }
    }

    // Both receiveCommand overloads switch on the same strings; a rename that
    // hits the map but not the switch compiles clean and fails at runtime.
    const switches = [
      ...readFileSync(KOTLIN, 'utf8').matchAll(/override fun receiveCommand\([^)]*\)\s*\{[\s\S]*?\n  \}/g),
    ].map((m) => m[0]);
    if (switches.length !== 2) {
      fail(
        'android:commands',
        `expected 2 receiveCommand overloads (String and Int), found ${switches.length}`,
      );
    }
    for (const cmd of commands) {
      // The Int overload switches on numeric literals by design; only the String
      // one dispatches by name.
      const named = switches.find((s) => s.includes('commandId: String?'));
      if (named && !new RegExp(`"${cmd}"\\s*->`).test(named)) {
        fail(
          'android:commands',
          `receiveCommand(root, commandId: String?, ...) has no "${cmd}" -> branch. ` +
            'It compiles, and then the command does nothing.',
        );
      }
    }

    if (!problems.some((p) => p.startsWith('android:commands'))) {
      log(`android: getCommandsMap() and receiveCommand() cover all ${commands.length} commands`);
    }
  }
}

// ---------------------------------------------------------------------------

log('');
if (problems.length) {
  for (const p of problems) log(`FAIL  ${p}`);
  log('');
  log(`${problems.length} problem(s).`);
  process.exit(1);
}
log('Codegen command names are consistent and collision-free.');