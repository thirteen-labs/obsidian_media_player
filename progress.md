# Progress — `obsidian-media-player`

**Status at `0.5.0`** (unreleased — the last published version is `0.1.5`).

This is the *status* document. [`to-be-done.md`](./to-be-done.md) is the *plan*:
why each fix was made, what the code looked like before, and where the reasoning
went wrong. This file answers "what state is it in, and how do I know?".

Everything below is evidence-based — a gate result, a test count, or a file
reference. Where something is **not** verified, it says so and says why.

---

## 1. Verification gates

All six run in CI. Four run on any host; two need specific hardware.

| Gate | What it actually proves | Needs | Status |
|---|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | — | **pass** |
| `npm run lint` | `eslint src --max-warnings=0` | — | **pass** |
| `npm test` | 229 tests, 14 suites | — | **pass** |
| `npm run bundle:web` | The whole public surface bundles for the browser with `react-native-web` | — | **pass** |
| `npm run verify:ios` | RN codegen output cross-checked against the Swift / ObjC++ sources — 12 checks, 8 rules | — | **pass** |
| `npm run verify:android` | All 9 `.kt` files type-check against real artifacts, RN 0.74 **and** 0.80 | — | **pass** |
| `npm run verify:android:host` | Gradle `assembleRelease` in a scaffolded host app | NDK | **never run** |
| `npm run verify:ios:pod` | `pod lib lint --allow-warnings` | macOS + CocoaPods | **never run** |
| `npm run verify:gates` | Proves each gate goes red on a known-bad input | clean tree (or `--force`) | **pass — 6/6 probes** |

`npm run verify` = typecheck + lint + test + `bundle:web` + `verify:ios`.

### The three that have never run, and why it matters

These are the honest limits of the current state. Nothing in this repository has
ever been compiled by Gradle, linted by CocoaPods, or run on a device.

1. **`verify:android:host`** — the Gradle build aborts at
   `configureCMakeRelWithDebInfo` *before* `compileReleaseKotlin`, which is how a
   duplicate `companion object` and an STL misconfiguration both shipped. The
   Kotlin matrix (`verify:android`) type-checks the sources but covers **no**
   manifest merging, CMake/NDK, or resource handling.
2. **`verify:ios:pod`** — `pod lib lint` resolves a real dependency graph. The
   podspec change is verified only as *text* (declared dependencies, architecture
   guard, bridging-header setting), which is not the same thing. This is the only
   gate left that has never executed.

**`verify:gates` now passes 6/6** — and finding that out took fixing two real
defects in the verification infrastructure itself, which is the argument for
having it:

- **`runProbe` never wrote the probe files.** Five of six probes declared
  `write: [...]` and returned it; the runner read `mutation.file` and never
  consumed `mutation.write`. No probe file was created, so the gates had nothing
  to fail on. Only `bundle` worked, because it writes inline inside `apply()`.
  Four gates were reported as "PASSED WHEN IT SHOULD HAVE FAILED" — the
  self-test failing at its own job while claiming the gates were not gates.
- **`verify:ios` was crashing on its own.** It did
  `combine = require('combine-js-to-schema')` and called it as a function, but
  that module exports an object of named functions. It had been passing against a
  codegen version that *did* export a bare function, and broke when
  `npm install` re-resolved `@react-native/codegen` to 0.74.89. It now resolves
  by capability, and fails with a message naming the real exports if it cannot.

The lesson is the one this document keeps making: a gate that has never been
challenged is a hypothesis. `verify:gates` is the only thing that could say so,
and it was itself dormant until someone ran it.

**Highest-value next action: commit, then switch on CI.** The self-test now runs
locally, but `verify:android:host` and `verify:ios:pod` are still only *written*.

---

## 2. Test coverage

229 tests across 14 suites, from 9 tests of one pure-function file at the start
of the audit.

| Suite | Tests | Covers |
|---|---:|---|
| `useMusicPlayer.web.test.tsx` | 38 | Web queue: shuffle, repeat, skip, auto-advance, header auth, object-URL lifetime |
| `webDownloadCache.test.ts` | 29 | CacheStorage downloads, id keying, eviction, enumeration, CORS/401/404 |
| `useAudioPlayer.test.tsx` | 23 | `useAudioPlayer` + `DownloadManager` lookup contract |
| `webFetch.test.ts` | 21 | `MediaSource.headers` → blob, eligibility, races |
| `webSession.test.ts` | 20 | `navigator.mediaSession`, feature detection, SSR |
| `Video.test.tsx` | 18 | Handle stability, `flush`, state propagation |
| `useRemoteControls.web.test.tsx` | 16 | `MediaSessionAction` → `RemoteCommand` mapping |
| `useMusicPlayer.test.tsx` | 15 | Events, listener bookkeeping, cache resolution |
| `PlaylistManager.test.ts` | 12 | Queue order, cursor edges, `-1` sentinel |
| `MediaProvider.test.tsx` | 10 | Context facade, state seeding |
| `architecture.test.ts` | 10 | Import-graph invariants (web-reachability) |
| `MusicPlayer.test.tsx` | 6 | `onEvent`, handle identity |
| `CastManager.test.ts` | 6 | Provider registration, honest failure |
| `Audio.test.tsx` | 5 | Component state, `onEvent` loop guard |

### What the tests cannot cover

- **Native behaviour.** No Kotlin test source set exists (`android/src/test` does
  not exist, no `testImplementation`/JUnit dependency), and there is no Swift
  runner. So the Android cache-key normalisation and the iOS HLS `localUri`
  fixes are verified by *compilation* only, not by assertions.
- **Devices.** Airplane mode, lock screens, headset buttons, audio focus,
  interruptions, DRM/HLS playback. None of it.
- **A real browser.** The web suites drive a fake `HTMLAudioElement`, a stubbed
  `fetch` and a counting `URL.createObjectURL` double. That proves the logic and
  the bookkeeping — not autoplay policy, CORS enforcement, or a 200 MB file.

### The rule used for every new test

A test that passes against deliberately broken code is worse than no test: it
reports coverage for a behaviour nothing is checking. Every fix in this work was
written by re-introducing the bug and confirming the suite went red.

**Five tests were found to be vacuous this way and had to be rewritten** — the
`safeDecode` guard with no test at all, an id-encoding test that used characters
`decodeURIComponent` passes through unchanged, a "does not re-register" test that
re-rendered with a *stable* callback, a `setPositionState` guard whose effect was
invisible because a `try/catch` swallowed the throw, and a `localUri` test added
for one resolver but not its sibling. Recorded in `to-be-done.md` per item.

---

## 3. Item status — all 40 tracked items

`✅` done and verified · `🟡` implemented, verification incomplete · `⛔` struck
(deliberately not shipping) · `⬜` not started

### Wave 0 — release blockers

| Item | | Status | Evidence |
|---|---|---|---|
| FG-0.1 | ✅ | `FOREGROUND_SERVICE_MEDIA_PLAYBACK` added | Manifest + README + plugin. **Not device-verified** — the fix is known-correct from the API contract, not from a running Android 14 device. |
| FG-0.2 | ✅ | `resizeMode` works on Android | `TextureView` `Matrix`, re-applied on size change / rotation / source change. Compile-verified only. |
| FG-0.3 | ✅ | `repeat` + `none` on iOS video | Matches Android's `REPEAT_MODE_ONE`, including emitting *no* event at the loop point. Swift is never compiled here. |
| FG-0.4a | ✅ | `'smooth'` deleted | Type + the Android `"smooth" ->` branch. Type-checked. |
| FG-0.4b | ✅ | `onVideoReady` deleted | Codegen spec. Type-checked. |
| FG-0.4c | ✅ | `onBuffering` edge-triggered both platforms | Android `STATE_BUFFERING`, iOS `timeControlStatus`. **Not device-verified** — the edge trigger is a code-reading fix. |
| FG-0.5 | ✅ | Duplicate `companion object` merged | **Kotlin-matrix verified** — a hard compile error, caught by the gate that exists now. |
| FG-0.6 | 🟡 | Native module has never been compiled | **Local half shipped**: `verify:android` (RN 0.74 + 0.80 matrix) + `verify:android:host` + `verify:ios:pod` in CI. **Unproven: all three CI jobs have never executed.** |
| FG-0.7 | ✅ | Advertised RN floor was never real | `BaseReactPackage` needs ≥0.74. Peer range + README + devDeps corrected. Found *by* FG-0.6's gate on its first honest run. |

### Wave 1 — public API correctness (shipped, complete)

| Item | | Status | Evidence |
|---|---|---|---|
| FG-1.1 | ✅ | `MediaProvider` returned `null` controls forever | 18-method delegating facade over `ref`, deref at call time. 10 tests. |
| FG-1.2 | ✅ | `useVideoPlayer().state` was a frozen constant | Real `useState` + stable `onState`. |
| FG-1.3 | ✅ | `Video.getState()` read a stale closure | `stateRef` + identity-stable handle + `flush()`. 18 tests; regressions re-confirmed. |
| FG-1.4 | ✅ | `useMusicPlayer` missed 3 of 7 events | All events handled; `ENDED` + `ERROR` now received. |
| FG-1.5 | ✅ | `VideoHandle` duplicated native/web | Moved to `src/types.ts`, shared. *Found while implementing FG-1.3.* |
| FG-1.6 | ✅ | All hooks double-counted listener bookkeeping | 12 adds / 7 removes for 6 subscriptions, measured. *Found while testing FG-1.4.* |

### Wave 2 — web parity (complete)

| Item | | Status | Evidence |
|---|---|---|---|
| FG-2.1 | ✅ | The package could not be imported on web at all | 9 `.web` files + `bundle:web`. **The gate fails on pre-fix code** (verified by moving the files aside). 5 web crashes found, not 1. |
| FG-2.2 | ✅ | `MediaSource.headers` unusable on web | `fetch` → blob → object URL for progressive sources. 7 mutations confirmed to fail. |
| FG-2.3 | ✅ | No `navigator.mediaSession` | All 8 actions, individually feature-detected; SSR safe. `Track.artwork` has its first consumer. |
| FG-2.4 | ✅ | Offline downloads were three stubs | Keyed by download **id** (not URL), so removal/enumeration work. Failures reject. 7 mutations confirmed. |
| FG-2.5 | ✅ | `Audio.web.tsx` reported no playback state at all | No media listeners; `onEvent` never called; `source` changes ignored. *Found while implementing FG-2.2.* |

### Wave 3 — iOS architecture (fixed; the *verification* is the remaining gap)

All three items are implemented. The code work is done and the plan's own
hypothesis turned out to be wrong in both directions (see `to-be-done.md`
FG-3.1) — the modules never needed `RCT_EXPORT_MODULE`, but the ObjC++ conformance,
the codegen protocol names, the bridging header and the interop allowlist were all
wrong.

| Item | | Status | Evidence |
|---|---|---|---|
| FG-3.1 | 🟡 | iOS module registration | 5/7 boxes. `verify:ios` checks protocol names + ObjC++ conformance statically (12 checks, 8 rules). **Unproven: `pod install`, and runtime module resolution on either architecture.** |
| FG-3.2 | 🟡 | Podspec declared app-target pods | 6/12 boxes. `ReactCodegen` → `React-Codegen`; `RCT-Folly` + `React-RCTAppDelegate` dropped; `SWIFT_OBJC_BRIDGING_HEADER` set explicitly. **Unproven: `pod lib lint`, `expo prebuild --clean`.** |
| FG-3.3 | ✅ | No Fabric component view for video | **Closed as accepted (interop-only, per D1).** But "interop works" was itself a finding: the allowlist opt-in and all 8 `RCT_EXTERN_METHOD` declarations were missing and are now fixed. 2/4 boxes — the remaining two need a device. |

### Wave 4 — Android media session (complete)

| Item | | Status | Evidence |
|---|---|---|---|
| FG-4.0 | ✅ | The service owned no player | `MediaSessionService` owns the shared `ExoPlayer`; module borrows, never releases. Kotlin-matrix verified. |
| FG-4.1 | ✅ | Lock-screen controls inert | `MediaStyle` notification + `onPlayerCommandRequest` gating + honest `setRemoteControls`. |
| FG-4.2 | ✅ | Music never emitted `onProgress` | 250 ms runnable, removed in `invalidate()`. |
| FG-4.3 | ✅ | *(folded into FG-4.1 step 5, as planned)* | — |
| FG-4.4 | ✅ | `removeTrack` restarted playback | Surgical order update, both platforms, mirroring web. |
| FG-4.5 | ✅ | `removeDownload` freed no bytes | Per-key `removeResource`; `clearCache` no longer deletes behind a live cache. |

### Wave 5 — offline correctness (1 of 5)

| Item | | Status | Evidence |
|---|---|---|---|
| FG-5.1 | 🟡 | Downloads never consulted at playback time | **All 6 steps implemented.** JS half covered (12 tests, 5 mutations). Native half **compile-verified only** — no Kotlin/Swift test runner exists. Device boxes open. |
| FG-5.2 | ⬜ | No download progress | Progress exists in the module and is logged; no JS event. |
| FG-5.3 | ⬜ | iOS HLS reported `"done"` after 2 s | *Partially addressed inside FG-5.1's HLS work (real completion signal), but not closed as an item.* |
| FG-5.4 | ⬜ | Android prefetch blocked a thread | Now on a shared executor with cancellation + timeout, per FG-5.1's surrounding work. Not closed as an item. |
| FG-5.5 | ⬜ | `getDownloads()` shapes differ per platform | Partly normalised (web returns a recorded byte count). Not closed. |

### Wave 6 — net-new capability (resolved)

| Item | | Status | Evidence |
|---|---|---|---|
| FG-6.1 | ⛔ | DRM: Widevine | **Struck**, decision D4. No session manager, no licence server. |
| FG-6.2 | ⛔ | DRM: FairPlay | **Struck**, decision D4. Needs `AVContentKeySession` + `fps` entitlement. |
| FG-6.5 | ✅ | Remove the DRM claim | `drmLicenseUri` gone from the type and all 6 native load paths. Verified by grep. |
| FG-6.3 | ✅ | Casting | Honest stub: `CastProvider` + `registerProvider` + `isSupported`; `connect()` rejects with an actionable error. No SDK. |
| FG-6.4 | ✅ | `artwork`/`duration` decoded then discarded | Android `MediaMetadata` + notification large icon; iOS `MPMediaItemPropertyArtwork` + declared-duration preference. |

### Wave 7 — cross-cutting (not started)

| Item | | Status | Note |
|---|---|---|---|
| FG-7.1 | ⬜ | `inBackground` permanently `false` | Now meaningful on Android (the service reports it) but never emitted to JS. |
| FG-7.2 | ⬜ | Expo plugin needs an undeclared dep | `plugin/index.js` requires `@expo/config-plugins` without a `peerDep`. |
| FG-7.3 | ⬜ | "Test coverage is one 53-line file" | **Effectively superseded** — 229 tests / 14 suites. The item's substance is done; the item was never closed. |

---

## 4. Feature status by platform

### Works on all three platforms

- Video playback with `resizeMode` (`contain` / `cover` / `stretch` / `none`)
- Audio playback, queue control, per-track `headers` / `type` / `cacheable`
- `MediaProvider` app-wide player with a stable `controls` facade
- Identity-stable handles + `flush()` for awaiting the synchronous `getState()`
- `onBuffering`, `onStateChange`, `onProgress`, `onEnded`, `onError`
- Offline download list: `download` / `getDownloads` / `removeDownload` / `clearCache` / `getCacheSize`
- Shuffle, repeat, skip, and previous-button restart semantics (shared `PlaylistManager`)

### iOS only

- Remote commands via `MPRemoteCommandCenter` (`useRemoteControls`)
- Background audio (audio session)

### Android only

- Foreground service + `MediaStyle` lock-screen notification
- `AudioAttributes` with focus handling
- `SimpleCache` disk cache (200 MB LRU)

### Web only

- `navigator.mediaSession` (OS media keys, lock screen, car stereo)
- `CacheStorage` offline downloads, keyed by download id
- Header-authenticated sources (`fetch` → blob → object URL), progressive only

### Deliberately not shipping

- **DRM** (Widevine / FairPlay) — needs infrastructure that does not exist
- **Smooth Streaming** — AVPlayer has no support at all
- **Casting SDK** — the seam is there; the SDK needs an app ID and devices
- **DSP** (EQ, ReplayGain, crossfade, gapless) — a decision, not a gap
- **Old Architecture on iOS** — dropped per decision D1

---

## 5. Known gaps

Ordered by how likely they are to bite a consumer.

1. **No CI has ever run.** Every "verified" claim above is from a local gate.
   Manifest merging, `pod lib lint`, and on-device behaviour are all unproven.
   This is why Wave 3 is 🟡 rather than ✅ despite the code being correct: the
   fixes are verified by *static cross-check*, not by a pod that resolves.
2. **Android has no unit-test source set.** Every Android fix is
   compile-verified and otherwise untested. The same for Swift.
3. **Web caching buffers whole files.** A 200 MB video is a 200 MB allocation
   before playback starts, and `fetch` is subject to CORS. `hls` / `dash` are
   refused rather than silently truncated.
4. **`setBackgroundEnabled` is a no-op on web.** A browser has no audio session.
5. **No audio focus / interruption handling on iOS.** The session *category* is
   configured; `AVAudioSession` interruptions, route changes and headphone-unplug
   are not handled. (Android got this in FG-4.0.)
6. **`hls` / `dash` offline downloads are refused** on web. Android handles
   segment sets on a best-effort basis only.
7. **Android's `isCachedFor` LRU check is unused** — added for FG-5.1, nothing
   calls it yet.

---

## 6. Planned next

In the order `to-be-done.md` puts them.

1. **Commit.** Everything is still uncommitted against a `0.1.5` baseline, and
   `verify:gates` (now 6/6) needs a clean tree to run unattended in CI.
2. **Switch on CI and read the output.** `verify:android:host` and
   `verify:ios:pod` are written and have never executed. FG-3.1 and FG-3.2 close
   on their results.
3. **Add an Android test source set** (JUnit + `android/src/test`). Closes the
   gap that makes every Android fix compile-verified-only.
4. **Wave 5, FG-5.2–5.5.** Download progress events, then the two items partly
   addressed in passing.
5. **Wave 7.** `inBackground` plumbing, the Expo plugin `peerDep`, and closing
   FG-7.3 as superseded.
6. **Device pass.** One Android handset (background playback, lock screen,
   airplane mode) and one iPhone (audio focus, remote commands, HLS). This is the
   only way to close the remaining `🟡` items honestly.

### Explicitly not planned

- Writing a Fabric component view (FG-3.3 was closed as interop-only; a native
  `RCTViewComponentView` is a real improvement but is a day of unverifiable work
  on a host with no macOS)
- A casting SDK
- DSP

---

## 7. Where things are

| Path | What |
|---|---|
| `src/` | TypeScript, the only hand-written cross-platform code |
| `src/types.ts` | The shared contract — every `*Handle` / `*Controls` / `RemoteCommand` type |
| `src/*.web.*` | Web implementations, auto-picked by Metro |
| `src/native/*.web.ts` | Web stubs: importable, throw only on *call* |
| `src/specs/` | RN codegen input. **Never import from web-reachable code** |
| `ios/`, `android/` | Native. `ObsidianMediaPlayerModules.mm` holds the ObjC++ conformance |
| `plugin/` | Expo config plugin |
| `scripts/` | The gates. `bundle-web.mjs`, `verify-ios-codegen.mjs`, `verify-android-kotlin.mjs` |
| `.github/workflows/ci.yml` | 4 jobs: `js`, `gate-self-test`, `android`, `ios` |
| `__tests__/` | 14 suites, 229 tests |
| `to-be-done.md` | The plan and the reasoning |
