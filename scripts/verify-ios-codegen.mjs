#!/usr/bin/env node
/**
 * iOS architecture gate (to-be-done.md FG-3.1, FG-3.2, FG-3.3).
 *
 * Runs RN codegen over `src/specs` and checks the *generated* output against
 * what the Swift and Objective-C++ actually reference. The point is that
 * neither a type check nor a jest suite can see this class of bug: the Swift
 * files are not compiled anywhere, and the generated header does not exist
 * until a macOS host runs `pod install`. Codegen, though, is a pure Node
 * function — it runs here, on any platform.
 *
 * Every check below corresponds to a real defect that shipped in this repo.
 * The rules are derived from the generated files at runtime rather than
 * hardcoded, so a rename in `src/specs` cannot quietly invalidate the gate.
 *
 * Verified failures against the pre-fix tree:
 *   - protocol names: Swift conformed to `ObsidianAudioSpec`; codegen emits
 *     `NativeObsidianAudioSpec`. The pod did not compile.
 *   - `addListener`/`removeListeners` on the cache spec: emitted on both sides
 *     as no-ops.
 *   - podspec: declared `ReactCodegen` (no such pod), `RCT-Folly` and
 *     `React-RCTAppDelegate` (both wrong for a library).
 *   - podspec: no `SWIFT_OBJC_BRIDGING_HEADER`, relying on a filename
 *     convention that a rename would break.
 *   - bridging header: imported the Objective-C++-only spec header.
 *   - video: the eight commands had no `RCT_EXPORT_METHOD` anywhere.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const failures = [];
const notes = [];
const fail = (rule, detail) => failures.push({ rule, detail });
const ok = (rule, detail) => notes.push({ rule, detail });

// ---------------------------------------------------------------------------
// 1. Run codegen.
// ---------------------------------------------------------------------------

// `combine-js-to-schema.js` does **not** export a callable. Depending on the
// codegen version it exports an object of named functions, and the default
// export shape has moved across 0.73 → 0.74 → 0.80. The gate resolves it by
// capability instead of by name, so a codegen upgrade cannot silently turn this
// file into a no-op that reports a failure it did not cause.
//
// `combineSchemas(files)` is the one that takes an absolute file list, which is
// what this gate has. `combineSchemasInFileList` takes (fileList, platform,
// exclude) and is the wrong shape.
let combineSchemas;
let RNCodegen;
let combineMod; // hoisted out of the try: the diagnostic below needs it
try {
  const codegenRoot = dirname(require.resolve('@react-native/codegen/package.json'));
  combineMod = require(join(codegenRoot, 'lib/cli/combine/combine-js-to-schema.js'));

  combineSchemas =
    typeof combineMod === 'function'
      ? combineMod // older codegen exported the function directly
      : combineMod.combineSchemas ??
        combineMod.default?.combineSchemas ??
        combineMod.default;

  RNCodegen = require(join(codegenRoot, 'lib/generators/RNCodegen.js'));
} catch (e) {
  console.error('Cannot load @react-native/codegen. Is node_modules installed?');
  console.error(e.message);
  console.error('Every job that runs this gate must run `npm ci` first — see');
  console.error('.github/workflows/ci.yml.');
  process.exit(1);
}

if (typeof combineSchemas !== 'function') {
  // Fail with the reason, not downstream as five confusing "was not generated"
  // errors. This exact ambiguity made the gate self-test report the ios gate as
  // "red for the wrong reason".
  console.error('Could not resolve a combine function from @react-native/codegen.');
  console.error(
    'combine-js-to-schema.js exports: ' +
      (typeof combineMod === 'function'
        ? '(a bare function)'
        : Object.keys(combineMod ?? {}).join(', '))
  );
  console.error('Expected an export taking an array of absolute spec file paths.');
  process.exit(1);
}

const libraryName = pkg.codegenConfig.name;
const specsDir = join(root, pkg.codegenConfig.jsSrcsDir);
const outDir = join(tmpdir(), `omp-ios-codegen-${process.pid}`);

// `filterJSFile` in RN's own CLI only accepts files named Native* or
// *NativeComponent, which is how codegen decides what a "spec" is. Reusing the
// name keeps this gate from drifting from the real build.
const specFiles = readdirSync(specsDir)
  .filter((f) => /^(Native.+|.+NativeComponent)/.test(f))
  .filter((f) => !f.endsWith('.d.ts'))
  .map((f) => join(specsDir, f));

// TurboModule spec base names (e.g. `NativeObsidianAudio`) and the JS module
// name each registers as (e.g. `ObsidianAudio`).
//
// Taken from the generated schema, filtered on `type === 'NativeModule'`.
// Both halves matter and neither is guessable from a filename:
//   - the schema key gives the *protocol* name, which is derived from the spec
//     file name, not from the string passed to `TurboModuleRegistry.getEnforcing`
//   - `type` separates TurboModules from the Fabric component spec, which
//     `codegenNativeComponent` also files under `modules`
let moduleSpecs = [];
let moduleNames = [];
{
  try {
    const schemaForNames = combineSchemas(specFiles);
    for (const [key, value] of Object.entries(schemaForNames.modules ?? {})) {
      if (value.type !== 'NativeModule') continue;
      moduleSpecs.push(key);
      moduleNames.push(value.moduleName ?? key.replace(/^Native/, ''));
    }
  } catch (e) {
    fail('protocols:schema', e.message);
  }
}

try {
  const schema = combineSchemas(specFiles);
  const nativeModules = Object.values(schema.modules ?? {}).filter(
    (m) => m.type === 'NativeModule',
  );
  if (nativeModules.length === 0) {
    fail(
      'codegen:modules',
      'no TurboModule specs were found in src/specs. Note that ' +
        'codegenConfig.type must stay "all" — "components" silently drops these, ' +
        'which is the 0.1.3 Android breakage.'
    );
  }
  RNCodegen.generate(
    {
      libraryName,
      schema,
      outputDirectory: outDir,
      packageName: 'com.obsidianmediaplayer',
    },
    { generators: ['modulesIOS', 'componentsIOS'], test: false },
  );
} catch (e) {
  fail('codegen:run', e.message);
}

const read = (...p) => readFileSync(join(outDir, ...p), 'utf8');
const specH = () => {
  try {
    return read(libraryName, `${libraryName}.h`);
  } catch {
    fail('codegen:header', `${libraryName}/${libraryName}.h was not generated`);
    return '';
  }
};

const header = specH();
const headerPath = `${libraryName}/${libraryName}.h`;

// ---------------------------------------------------------------------------
// 2. TurboModule protocol names.
//
// Codegen derives the protocol name from the *spec file* name, not from the
// string passed to `TurboModuleRegistry.get`. `NativeObsidianAudio.ts` becomes
// `@protocol NativeObsidianAudioSpec`. The Swift files conformed to
// `ObsidianAudioSpec`, which nothing ever declares — the iOS build could not
// have compiled. This is the single most important check in the file.
// ---------------------------------------------------------------------------

const generatedProtocols = [...header.matchAll(/@protocol\s+(\w+Spec)\s*</g)].map(
  (m) => m[1],
);

if (moduleSpecs.length === 0) {
  fail('protocols:expected', 'no TurboModule spec files matched the expected naming');
}

for (const base of moduleSpecs) {
  const want = `${base}Spec`;
  if (generatedProtocols.includes(want)) {
    ok('protocols', `${want} is generated`);
  } else {
    fail(
      'protocols',
      `${base}.ts should generate @protocol ${want}, but the header declares ` +
        `[${generatedProtocols.join(', ') || 'nothing'}]`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. No Swift file may reference a protocol that does not exist.
//
// Catches the inverse error too: a protocol name that *is* generated but is
// not the one for this module.
// ---------------------------------------------------------------------------

const swiftDir = join(root, 'ios');
const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
const swiftFiles = walk(swiftDir).filter((f) => f.endsWith('.swift'));

// No Swift file may declare conformance to a codegen protocol. This is the
// single most important structural rule in the file, for two independent
// reasons:
//
//   a) `RCTTurboModule` declares getTurboModule: returning a C++
//      `std::shared_ptr`, which Swift cannot implement. Conformance must be an
//      Objective-C++ category regardless of naming.
//   b) the protocol name has to be spelled exactly as codegen emits it, and
//      getting it wrong is a compile error, not a warning. The original code
//      declared `ObsidianAudioSpec` where codegen emits
//      `NativeObsidianAudioSpec`, and the pod could not build.
//
// Note the direction of the test: a Swift conformance to a name that is *not*
// in the generated header is the bug, so that is what fails. (Testing the other
// way round — flagging conformances whose name *is* generated — would have
// passed the original code, which is the mistake this rule exists to prevent.)
const allGeneratedProtocols = new Set([
  ...generatedProtocols,
  // The Fabric view protocol lives in RCTComponentViewHelpers.h, not the spec
  // header, and is also unimplementable from Swift for the same C++ reason.
  'RCTObsidianVideoViewProtocol',
]);

for (const file of swiftFiles) {
  const src = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1).replace(/\\/g, '/');

  const conformances = [...src.matchAll(/extension\s+\w+\s*:\s*([\w.,\s]+?Spec)\s*\{/g)];
  for (const [, protoList] of conformances) {
    for (const proto of protoList.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!allGeneratedProtocols.has(proto)) {
        fail(
          'swift:no-conformance',
          `${rel} declares 'extension ...: ${proto}', which codegen does not ` +
            `emit. The generated protocols are [${[...allGeneratedProtocols].join(', ')}]. ` +
            'This is a hard compile error, and it is how the pod failed to build.'
        );
      } else {
        fail(
          'swift:no-conformance',
          `${rel} declares 'extension ...: ${proto}'. Even with a correct name, ` +
            'RCTTurboModule requires a C++ getTurboModule: that Swift cannot ' +
            'implement — this belongs in ios/ObsidianMediaPlayerModules.mm.'
        );
      }
    }
  }

  // `#if RCT_NEW_ARCH_ENABLED` in Swift does not work the way it reads. It is
  // a *Swift* conditional, and RCT_NEW_ARCH_ENABLED is a C preprocessor macro,
  // so it is never defined to Swift and the block is always compiled out — a
  // way to silently drop conformance that looks conditional. `import` must
  // also be at file scope.
  const guardedImport = /#if\s+RCT_NEW_ARCH_ENABLED[\s\S]{0,80}?\bimport\s+ObsidianMediaPlayerSpec/.test(
    src,
  );
  if (guardedImport) {
    fail(
      'swift:swift-if',
      `${rel} wraps 'import ObsidianMediaPlayerSpec' in #if RCT_NEW_ARCH_ENABLED. ` +
        'That is a C macro, not a Swift compilation condition, so the block is ' +
        'always skipped. Conformance belongs in the .mm file.'
    );
  }
}

// ---------------------------------------------------------------------------
// 4. The Objective-C++ registration file must exist and cover every module.
// ---------------------------------------------------------------------------

const mmPath = join(swiftDir, 'ObsidianMediaPlayerModules.mm');
let mm = '';
try {
  mm = readFileSync(mmPath, 'utf8');
} catch {
  fail('mm:exists', 'ios/ObsidianMediaPlayerModules.mm is missing');
}

if (mm) {
  for (const [i, base] of moduleSpecs.entries()) {
    const proto = `${base}Spec`;
    const moduleName = moduleNames[i];
    if (mm.includes(`<${proto}>`)) {
      ok('mm:conforms', `${proto} conformance present`);
    } else {
      fail(
        'mm:conforms',
        `no Objective-C++ conformance to ${proto}. Without it the module is ` +
          'never registered as a TurboModule.'
      );
    }
    // The JSI class returns the actual implementation; a conformance without
    // it would compile and then fail at module creation.
    const jsi = `${proto}JSI`;
    if (!mm.includes(jsi)) {
      fail('mm:getTurboModule', `no getTurboModule: returning ${jsi}`);
    }
    // +moduleName is mandatory: RCTBridgeModuleNameForClass calls
    // `[cls moduleName]` unconditionally while instantiating the module, so a
    // missing implementation is an unrecognised selector, not a nil return.
    // RCT_EXPORT_MODULE would normally supply it.
    if (!new RegExp(`\\+\\s*\\(NSString\\s*\\*\\)\\s*moduleName[\\s\\S]{0,120}@"${moduleName}"`).test(mm)) {
      fail(
        'mm:moduleName',
        `no +moduleName returning @"${moduleName}". RCT_EXPORT_MODULE normally ` +
          'supplies this, and RCTBridgeModuleNameForClass calls [cls moduleName] ' +
          'unconditionally — a missing implementation crashes on lookup.'
      );
    }
  }

  if (!/supportLegacyViewManagerWithName\s*:\s*@"ObsidianVideo"/.test(mm)) {
    fail(
      'mm:interop-allowlist',
      'ios/ObsidianMediaPlayerModules.mm does not opt "ObsidianVideo" into ' +
        "RCTLegacyViewManagerInteropComponentView's supported list. " +
        'RCTComponentViewFactory only reaches the Paper interop layer when ' +
        'isSupported: returns YES, and that list is hardcoded, so without this ' +
        '<ObsidianVideo> resolves to RCTUnimplementedViewComponentView and ' +
        'renders nothing — silently.'
    );
  }

  // The spec header is Objective-C++ only. It has `#ifndef __cplusplus /
  // #error`, so it must never be reachable from the Swift bridging header.
  if (!/^#import\s+<ObsidianMediaPlayerSpec\//m.test(mm)) {
    fail('mm:spec-import', `${headerPath} is not imported in the .mm file`);
  }
  const jsiImpl = /std::make_shared<facebook::react::\w+SpecJSI>/;
  if (!jsiImpl.test(mm)) {
    fail('mm:make_shared', 'no std::make_shared<...SpecJSI> in the .mm file');
  }
}

// ---------------------------------------------------------------------------
// 5. Bridging header: Objective-C only.
// ---------------------------------------------------------------------------

const bridgingPath = join(swiftDir, 'ObsidianMediaPlayer-Bridging-Header.h');
let bridging = '';
try {
  bridging = readFileSync(bridgingPath, 'utf8');
} catch {
  fail('bridging:exists', 'ObsidianMediaPlayer-Bridging-Header.h is missing');
}

/** Blank out `//` and `/* *\/` comments. */
const uncomment = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

if (bridging) {
  // These files explain *why* each header is absent, so a raw grep would match
  // the explanation and pass for the wrong reason. Scan the code only.
  const bridgingCode = uncomment(bridging);

  if (/ObsidianMediaPlayerSpec/.test(bridgingCode)) {
    fail(
      'bridging:no-spec',
      'the bridging header imports ObsidianMediaPlayerSpec.h. A bridging ' +
        'header is parsed as Objective-C, and that header opens with ' +
        '"#ifndef __cplusplus / #error", so the build fails.'
    );
  }
  if (/RCTViewComponentView/.test(bridgingCode)) {
    fail(
      'bridging:no-fabric',
      'the bridging header imports RCTViewComponentView.h, but this pod has no ' +
        'RCTViewComponentView subclass. <ObsidianVideo> renders through the ' +
        'legacy interop layer (see FG-3.3).'
    );
  }
  // Without these the Swift files lose RCTEventEmitter / RCTViewManager, since
  // none of them `import React`.
  for (const headerName of ['RCTBridgeModule.h', 'RCTEventEmitter.h', 'RCTViewManager.h']) {
    if (!bridging.includes(headerName)) {
      fail(
        'bridging:react-headers',
        `the bridging header does not import ${headerName}. The Swift files use ` +
          'no `import React`, so this header is their only route to it.'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Podspec.
// ---------------------------------------------------------------------------

const podspec = readFileSync(join(swiftDir, 'ObsidianMediaPlayer.podspec'), 'utf8');

// The podspec declares its React Native dependencies through RN's own
// `install_modules_dependencies(s)` helper rather than listing `s.dependency`
// lines. It has to: `React-RCTFabric` — the pod providing
// `RCTLegacyViewManagerInteropComponentView`, which the +load allowlist opt-in
// needs — ships only inside the react-native npm package and returns 404 from
// the CocoaPods trunk, so `pod lib lint` could not resolve it (FG-3.1).
//
// So these checks assert on *intent* — the pod must be accounted for somehow —
// not on a literal line. Asserting the literal would have failed the moment the
// helper was adopted, for a reason that has nothing to do with correctness, and
// would then train people to read this gate as noise.

// Declared directly, or delegated to the helper. Both satisfy the intent.
const declares = (pod) =>
  new RegExp(`^\\s*s\\.dependency\\s+"${pod}"`, 'm').test(podspec) ||
  (/^\s*install_modules_dependencies\(/m.test(podspec) &&
    new RegExp(`^\\s*(#|\\s).*${pod}`, 'm').test(podspec));

if (/^\s*s\.dependency\s+"ReactCodegen"/m.test(podspec)) {
  fail(
    'podspec:codegen-name',
    'declares ReactCodegen. The pod is React-Codegen (hyphenated), so every ' +
      'pod install fails with "Unable to find a specification for ReactCodegen".'
  );
}
if (!declares('React-Codegen')) {
  fail(
    'podspec:codegen-name',
    'does not depend on React-Codegen, directly or via install_modules_dependencies'
  );
} else {
  ok('podspec:codegen-name', 'depends on React-Codegen');
}

for (const [pod, why] of [
  ['RCT-Folly', 'a vendored pod the app must source consistently; depending on it from a library risks a duplicate or mismatched copy'],
  ['React-RCTAppDelegate', 'an app-target pod; a library depending on it is backwards'],
]) {
  // Only ever a *direct* declaration is a problem. install_modules_dependencies
  // legitimately pulls RCT-Folly in — that is RN's own helper doing its job — so
  // flagging it here would fail the gate for the correct, intended behaviour.
  if (new RegExp(`^\\s*s\\.dependency\\s+"${pod}"`, 'm').test(podspec)) {
    fail('podspec:app-pods', `declares ${pod} directly: ${why}`);
  }
}

if (!declares('React-RCTFabric')) {
  fail(
    'podspec:fabric',
    'does not depend on React-RCTFabric, directly or via ' +
      'install_modules_dependencies. RCTLegacyViewManagerInteropComponentView ' +
      'lives in that pod, and the +load allowlist opt-in needs its header.'
  );
} else {
  ok('podspec:fabric', 'React-RCTFabric is declared (via install_modules_dependencies)');
}

if (!/RCT_NEW_ARCH_ENABLED/.test(podspec)) {
  fail(
    'podspec:new-arch-guard',
    'does not guard on RCT_NEW_ARCH_ENABLED. iOS requires the New Architecture ' +
      '(D1); failing at pod install is far kinder than failing inside a ' +
      'generated header or at runtime.'
  );
}
if (!/SWIFT_OBJC_BRIDGING_HEADER/.test(podspec)) {
  fail(
    'podspec:bridging-header',
    'does not set SWIFT_OBJC_BRIDGING_HEADER. It currently works only because ' +
      'the filename matches Xcode\'s <Target>-Bridging-Header.h convention, so a ' +
      'pod rename would break every Swift file silently.'
  );
}

// The dead availability guard: the pod floors at iOS 13 and
// AVAssetDownloadURLSession landed in iOS 10, so `if #available(iOS 10.0, *)`
// is always true. Harmless, but it reads as a real constraint.
const cacheSwift = swiftFiles.find((f) => f.includes('ObsidianCacheModule.swift'));
if (cacheSwift) {
  const src = readFileSync(cacheSwift, 'utf8');
  const guard = /#available\(iOS 10\.0/.test(src);
  if (guard) {
    fail(
      'swift:dead-availability',
      'ObsidianCacheModule.swift guards AVAssetDownloadURLSession with ' +
        '#available(iOS 10.0, *), which is always true at the iOS 13 floor. ' +
        'It reads as a real constraint and protects nothing.'
    );
  }
}

// ---------------------------------------------------------------------------
// 7. The cache spec must not declare listener methods it cannot use.
//
// ObsidianCache extends NSObject, not RCTEventEmitter. It declared
// addListener/removeListeners as empty @objc stubs purely to satisfy the spec,
// which is how a module that never emits an event ended up advertising that it
// does. Codegen faithfully emitted both sides, so nothing caught it.
// ---------------------------------------------------------------------------

const cacheSpecPath = join(specsDir, 'NativeObsidianCache.ts');
if (readFileSync(cacheSpecPath, 'utf8').match(/^\s*(addListener|removeListeners)\s*:/m)) {
  fail(
    'spec:cache-listeners',
    'NativeObsidianCache.ts declares addListener/removeListeners, but ' +
      'ObsidianCache is not an RCTEventEmitter and never emits. Remove them ' +
      'from both the spec and the Swift class.'
  );
}

// ---------------------------------------------------------------------------
// 8. The video view's commands must be exported as RCT_EXPORT_METHOD.
//
// The interop coordinator resolves commands by scanning the view manager for
// methods whose selector starts with `__rct_export__` — i.e. those produced by
// RCT_EXPORT_METHOD. The eight Swift @objc methods matched none of them, so
// every Video handle command would log `No command found with name "play"` and
// do nothing. Nothing in the type system covers this.
// ---------------------------------------------------------------------------

const videoSpec = readFileSync(join(specsDir, 'NativeObsidianVideo.ts'), 'utf8');
const commandsBlock = videoSpec.match(
  /supportedCommands:\s*\[([\s\S]*?)\]/,
);
if (!commandsBlock) {
  fail('video:commands', 'could not find supportedCommands in NativeObsidianVideo.ts');
} else {
  const commands = [...commandsBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (commands.length === 0) {
    fail('video:commands', 'supportedCommands is empty');
  }
  for (const cmd of commands) {
    if (!new RegExp(`RCT_EXTERN_METHOD\\(\\s*${cmd}\\s*:`).test(mm)) {
      fail(
        'video:command-export',
        `command "${cmd}" has no RCT_EXTERN_METHOD. The interop coordinator ` +
          'looks commands up by RCT_EXPORT_METHOD metadata, so an @objc Swift ' +
          'method alone is invisible to it.'
      );
    }
  }
  ok('video:commands', `${commands.length} commands exported via RCT_EXTERN_METHOD`);

  // Cross-check against the generated Fabric helpers: every command the
  // generated protocol knows about must be one we export.
  const helpersPath = join(
    outDir,
    'react/renderer/components',
    libraryName,
    'RCTComponentViewHelpers.h',
  );
  try {
    const helpers = readFileSync(helpersPath, 'utf8');
    // The closing paren is optional in the generated form: the first branch is
    // `isEqualToString:@"play"])` and the rest are `isEqualToString:@"pause"])`.
    const generated = [...helpers.matchAll(/isEqualToString:@"(\w+)"/g)].map((m) => m[1]);
    const unique = [...new Set(generated)];
    if (unique.length === 0) {
      fail(
        'video:command-drift',
        'no commands were found in the generated RCTComponentViewHelpers.h, so ' +
          'supportedCommands could not be cross-checked'
      );
    }
    for (const cmd of unique) {
      if (!commands.includes(cmd)) {
        fail('video:command-drift', `generated helpers know "${cmd}" but supportedCommands does not list it`);
      }
    }
    for (const cmd of commands) {
      if (!unique.includes(cmd)) {
        fail('video:command-drift', `supportedCommands lists "${cmd}" but no generated command dispatches to it`);
      }
    }
    ok('video:command-drift', `supportedCommands matches all ${unique.length} generated commands`);
  } catch {
    fail('video:command-drift', 'RCTComponentViewHelpers.h was not generated');
  }
}

// ---------------------------------------------------------------------------
// 9. Spec method coverage.
//
// For each TurboModule, every method the spec declares must exist in the
// corresponding Swift class. `extension ...: Spec {}` was supposed to enforce
// this at compile time; since conformance moved to the .mm, this gate is the
// replacement. A mismatch is otherwise invisible until an app is built.
// ---------------------------------------------------------------------------

const moduleToSwift = {
  NativeObsidianAudio: 'Audio/ObsidianAudioModule.swift',
  NativeObsidianCache: 'Cache/ObsidianCacheModule.swift',
  NativeObsidianMusicPlayer: 'Music/ObsidianMusicPlayerModule.swift',
};

for (const [base, relPath] of Object.entries(moduleToSwift)) {
  const protoMatch = header.match(
    new RegExp(`@protocol\\s+${base}Spec\\s*<[^>]*>([\\s\\S]*?)@end`),
  );
  if (!protoMatch) continue;

  const swiftPath = join(swiftDir, relPath);
  if (!readFileSync(swiftPath, 'utf8').length) {
    fail(`spec:${base}`, `${relPath} is empty`);
    continue;
  }
  const swift = readFileSync(swiftPath, 'utf8');

  // addListener/removeListeners are declared on the spec for the two
  // RCTEventEmitter subclasses; check the rest of the surface.
  const methods = [
    ...protoMatch[1].matchAll(/^\s*-\s*\(void\)(\w+):/gm),
  ].map((m) => m[1]);

  const listeners = new Set(['addListener', 'removeListeners']);
  for (const method of methods) {
    if (listeners.has(method)) continue;
    if (!new RegExp(`@objc(\\([^)]*\\))?\\s+func\\s+${method}\\b`).test(swift)) {
      fail(
        `spec:${base}`,
        `${relPath} does not implement "${method}", which ` +
          `@protocol ${base}Spec requires. Nothing else checks this: the ` +
          'conformance is in ObjC++, so the Swift compiler never verifies it.'
      );
    }
  }
  ok(`spec:${base}`, `${methods.length} protocol methods checked against ${relPath}`);
}

// ---------------------------------------------------------------------------
// 10. JS side: no legacy fallback, and the error names the real fix.
// ---------------------------------------------------------------------------

const jsNative = join(root, 'src', 'native');
for (const file of ['AudioNative.ts', 'MusicPlayerNative.ts', 'CacheNative.ts']) {
  const src = readFileSync(join(jsNative, file), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (/NativeModules/.test(code)) {
    fail(
      'js:no-fallback',
      `${file} reads NativeModules. iOS requires the New Architecture (D1), so ` +
        'that path cannot work — and it is the path that turned a missing ' +
        'module into a silent undefined.'
    );
  }
  if (/__turboModuleProxy/.test(code)) {
    fail('js:no-fallback', `${file} branches on __turboModuleProxy; D1 removed the choice`);
  }
  if (!/requireTurboModule/.test(code)) {
    fail('js:no-fallback', `${file} does not go through requireTurboModule`);
  }
}

const resolver = readFileSync(join(jsNative, 'requireTurboModule.ts'), 'utf8');
if (!/TurboModuleRegistry\.get</.test(resolver)) {
  fail('js:resolver', 'requireTurboModule does not use TurboModuleRegistry.get');
}
if (!/RCT_NEW_ARCH_ENABLED=1/.test(resolver)) {
  fail(
    'js:resolver',
    "requireTurboModule's error does not name RCT_NEW_ARCH_ENABLED=1. The old " +
      'message said only "not linked", which sent people to re-run pod install ' +
      'and gain nothing.'
  );
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\nverify:ios-codegen FAILED — ${failures.length} problem(s)\n`);
  for (const { rule, detail } of failures) {
    console.error(`  [${rule}]\n    ${detail}\n`);
  }
  process.exit(1);
}

// Group the pass list: repeated rule names (one per module) are noise.
const byRule = new Map();
for (const { rule, detail } of notes) {
  if (!byRule.has(rule)) byRule.set(rule, []);
  byRule.get(rule).push(detail ?? rule);
}

console.log(
  `verify:ios-codegen OK — ${notes.length} checks passed ` +
    `across ${byRule.size} rules`,
);
for (const [rule, details] of byRule) {
  const unique = [...new Set(details)];
  const suffix =
    unique.length === 1 && unique[0] === rule
      ? ''
      : ` — ${unique.filter((d) => d !== rule).join('; ') || 'ok'}`;
  console.log(`  ✓ ${rule}${suffix}`);
}
console.log(
  '\nNote: this validates the generated specs against the native sources. It ' +
    'cannot\ncompile Swift or run a device — FG-0.6 tracks that gap.',
);
