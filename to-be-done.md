# To Be Done — `obsidian-media-player`

Implementation plan for every gap found in the capability audit. This is a
**work plan, not a changelog** — it records what to change, in what order, and how
to prove each item is done. Items are grouped into waves; each wave is
independently shippable and must not start before the wave above it is merged.

Written against `0.2.0` and maintained across releases, so the version in the
title is deliberately absent. For the current state — including what is *not*
verified — see [`progress.md`](./progress.md) and the `README.md` changelog.

> **The checkboxes in this document are not a reliable status signal.** They
> record the verification the plan *anticipated*, which for native work usually
> meant a device. Several items later verified by compilation or by a static gate
> kept their boxes unticked, and several are marked DONE in the table above with
> zero boxes ticked. `progress.md` records the actual evidence for each item; the
> table below is the plan, not the truth.

## Progress

| Item | Status | Notes |
|---|---|---|
| FG-0.1 | **DONE** | `AndroidManifest.xml` + `README.md` + `plugin/index.js`. |
| FG-0.2 | **DONE** | `ObsidianVideoView.kt` — `Matrix` scaling, `onVideoSizeChanged`, `onSizeChanged`, reset on `load()`. |
| FG-0.3 | **DONE** | `ObsidianVideoPlayer.swift` — `setRepeat`, silent loop, `none` gravity; `ObsidianVideoView.swift` wiring. |
| FG-0.4a | **DONE** | `'smooth'` deleted from `MediaSourceType` + the Android `"smooth" ->` branch. |
| FG-0.4b | **DONE** | `onVideoReady` deleted from the codegen spec (and the now-unused `Int32` import). |
| FG-0.4c | **DONE** | `onBuffering` implemented edge-triggered on Android (`STATE_BUFFERING`) and iOS (`timeControlStatus == .waitingToPlay`). |
| FG-0.5 | **DONE** | Found while implementing FG-0.2. Merged the duplicate `companion object`. |
| FG-6.5 | **DONE** | `drmLicenseUri` removed from `MediaSource` and all 6 native load paths. |
| FG-1.1 | **DONE** | `MediaProvider` — stable delegating `controls` facade; `INITIAL_STATE` seed; `position` propagates. |
| FG-1.2 | **DONE** | `useVideoPlayer` — real `useState` + `onState` callback. |
| FG-1.3 | **DONE** | `Video`/`MusicPlayer`/`Video.web` — `stateRef` + stable handle; `flush()` added. |
| FG-1.4 | **DONE** | `useMusicPlayer` — 6 events (was 4); manual listener bookkeeping deleted. |
| FG-1.5 | **DONE** | *Found while implementing FG-1.3.* `VideoHandle` moved to `src/types.ts`, shared with the web build. |
| FG-1.6 | **DONE** | *Found while testing FG-1.4.* All three hooks double-counted native listener bookkeeping. |
| FG-2.1 | **DONE** | 9 new `.web` files; `npm run bundle:web` gate + CI. Found 3 more web crashes and 3 order-indexing bugs. |
| FG-2.2 | **DONE** | `utils/webFetch.ts` (`resolveWebSource` + `WebSourceSlot`); headers work on web; found FG-2.5. |
| FG-2.5 | **DONE** | *Found while implementing FG-2.2.* `Audio.web.tsx` had no media event listeners and ignored `source` changes. |
| FG-2.3 | **DONE** | `utils/webSession.ts` + a real `useRemoteControls.web`; `Track.artwork` has a consumer for the first time. |
| FG-2.4 | **DONE** | `core/webDownloadCache.ts`; entries keyed by id, so `removeDownload` and `getDownloads` finally work. Failures reject. |
| FG-5.1 | **partial** | All 6 steps implemented (step 6 closed as redundant with `cacheable`). Tests deferred by request; device verification open. |
| FG-0.6 | **DONE** (local + CI written) | *Added after the 0.5.0 CMake failure.* **Local half shipped**: `npm run verify:android` compiles all 9 `.kt` files against real artifacts across an RN 0.74/0.80 matrix. **CI half shipped**: `.github/workflows/ci.yml` runs it, a Gradle `assembleRelease` in a scaffolded host app, and `pod lib lint`. **iOS half added by Wave 3**: `npm run verify:ios` runs RN codegen and cross-checks the generated protocols against the Swift/ObjC++ — it found four hard build failures. Unproven: the Gradle and pod jobs have never executed on a real push. |
| FG-0.7 | **DONE** | *Found by FG-0.6's gate on its first honest run.* `BaseReactPackage` does not exist before RN 0.74, so the advertised `>=0.73` floor could not compile. Peer range + README corrected to `>=0.74.0`; devDeps + example moved to `0.74.7` and the stub `@types/react-native` dropped. |
| FG-4.0 | **DONE** (0.5.0) | `MediaSessionService` owns the shared player (`MusicPlaybackHolder`); module borrows, never releases. AudioAttributes + focus in `buildPlayer`. Kotlin gate green on 0.74 + 0.80; device verification still open. |
| FG-4.1 | **DONE** (0.5.0) | `MediaStyle` notification + actions, `onPlayerCommandRequest` gating, honest `setRemoteControls`, `{ command, payload }` remote events on both platforms. |
| FG-4.2 | **DONE** (0.5.0) | 250 ms `onProgress` runnable; `invalidate` removes callbacks. |
| FG-4.3 | **DONE** (0.5.0) | Folded into FG-4.1 as planned. |
| FG-4.4 | **DONE** (0.5.0) | Surgical order update on Android + iOS, mirroring web; reload only when the active track was removed; empty queue stops to idle. |
| FG-4.5 | **DONE** (0.5.0) | Per-key `removeResource(uri)` eviction; `clearCache` evicts per key, no delete-behind-live-cache. HLS segment sets best-effort only. |
| FG-6.3 | **DONE** (0.5.0) | Honest stub: `CastProvider` + `registerProvider`, `isSupported`, rejecting `connect`. No SDK bundled — still needs app ID + device. |
| FG-6.4 | **DONE** (0.5.0) | Android `MediaMetadata` + notification large icon; iOS `MPMediaItemPropertyArtwork` + declared-duration preference. |
| FG-3.1 | **DONE** | *Wave 3. Verified before changing; the plan's hypothesis was wrong in both directions.* 4 hard build failures found and fixed. |
| FG-3.2 | **DONE** | Podspec: `ReactCodegen` → `React-Codegen`, dropped `RCT-Folly` + `React-RCTAppDelegate`, added `React-RCTFabric`, explicit `SWIFT_OBJC_BRIDGING_HEADER`, `pod install` fails loudly without `RCT_NEW_ARCH_ENABLED=1`. |
| FG-3.3 | **DONE** (accepted) | Interop confirmed working — but only after fixing three separate things it needed. Documented, not rewritten. |
| everything else | not started | **Waves 5 and 7 open.** Wave 3 (iOS architecture) and Wave 4 (Android media session) are done. Wave 5 (offline correctness) has FG-5.1 partial. Wave 7 (cross-cutting) is untouched. |

**Wave 3 is complete, and its first instruction was "verify, do not assume". That
turned out to matter more than anything else in the wave.** FG-3.1's step 1 said
codegen "may generate a module provider that covers these by class name — this
must be verified, not assumed", and its risk note warned that fixing a
non-problem would mean adding ObjC shims the New Architecture ignores anyway.
**Both halves were right.** The `RCT_EXPORT_MODULE` question turned out to be
almost entirely a non-problem; the actual blocker was three syntax errors
further in, none of which the plan had recorded. Details in
[Wave 3](#wave-3--ios-architecture) — including why the plan's
`extension ObsidianAudio: ObsidianAudioSpec {}` could never have compiled, and
why `#if RCT_NEW_ARCH_ENABLED` in a `.swift` file is a no-op that reads like a
guard. The gate is `npm run verify:ios`, which runs codegen for real; it is
platform-independent and costs about a second.

**Status overview lives in [`progress.md`](./progress.md)** — this document is the
plan and the reasoning, not the status. Note that the per-item checkbox state
below does **not** always track the progress table: several items marked DONE have
their device-verification boxes still unticked, because they were verified by
compilation or by a static gate rather than by the checks the plan anticipated.
`progress.md` records the actual evidence for each.

**Wave 2 is complete: FG-2.1, FG-2.2, FG-2.3, FG-2.4 and FG-2.5 are done.** The
web build went from "cannot be imported" to a working player with working header
auth, a working media session and working offline downloads, and the reason it had
never been caught is now itself a gate — `npm run bundle:web`. Test coverage is
**185 across eleven suites**. See
[FG-2.1](#fg-21--no-musicplayer-web-build-breaks-web-bundling),
[FG-2.2](#fg-22--web-mediasourceheaders-cannot-be-applied),
[FG-2.3](#fg-23--web-no-navigatormediasession) and
[FG-2.4](#fg-24--web-real-offline-download) for what the audit got wrong in each,
and for the five tests that turned out to be vacuous.

> **All of the work below shipped in a single `0.5.0` release.** Intermediate
> versions `0.3.0` / `0.3.1` / `0.4.0` were used while writing these sections but
> never published - npm's last version is `0.1.5` - so the "shipped as `0.3.0`"
> phrasing elsewhere in this document means "landed during the `0.3.0` work
> session", not a version a consumer ever saw. Read those as history, not as a
> release history.

**Waves 3, 4 and 6 are complete** (behaviour changes: `CastManager.connect()`
rejects without a provider; `removeDownload` / `clearCache` resolve richer
payloads; iOS requires the New Architecture). Native verification is partial by
construction: `npm run verify:android` compiles all 9 `.kt` files on RN 0.74 +
0.80, and `npm run verify:ios` cross-checks codegen against the Swift / ObjC++
sources - but neither is a compile, and manifest merging, `pod lib lint` and
on-device behaviour (service lifecycle, lock screen, artwork rendering) still need
CI and a handset. `verify:ios` found four hard build failures by itself.
Coverage is **229 across fourteen suites**.

**Wave 1 is complete** (breaking TS changes: `drmLicenseUri`, `'smooth'`,
`onVideoReady`). A changelog entry was added to `README.md`, plus a **Not
supported** section stating plainly what does not work - the whole point of
D2/D3/D4 was to stop advertising capabilities that were never delivered.

**Wave 0 is complete except the CI half of FG-0.6, which was added later.** The
original six items are done, but "done" here means *written*, not *compiled*: no
CI job has ever built this module, and the two hard Kotlin compile errors that
reached a published version were found by reading, not by building. See
[FG-0.6](#fg-06--nothing-has-ever-compiled-the-native-module).

**Wave 0's remaining work is now written but unproven.** `.github/workflows/ci.yml`
exists with the three gates FG-0.6 asks for, and a self-test
(`npm run verify:gates`) proves each one goes red on a known-bad input. Nothing
in that sentence has been executed: a workflow that has never run is a document,
not a gate, which is the same failure FG-0.6 was filed for.

Test coverage went from 9 tests of pure functions to **58 across six suites**
(`Video`, `MusicPlayer`, `Audio`, `useMusicPlayer`, `MediaProvider`,
`PlaylistManager`). Every new test was verified to **fail against the pre-fix
code** — see [Verifying the regression tests](#verifying-the-regression-tests).

**One correction to the original plan.** FG-6.5 step 5 said to strip DRM from
`package.json:4`. The description never mentioned DRM; the advertising was all in
`README.md` (the feature bullet, the `MediaSource` reference, the caching section
and two roadmap rows). Corrected here.

### One item was not in the original audit: the duplicate `companion object`

It surfaced because compiling all 8
Kotlin files with `kotlin-compiler-embeddable` was the only way to type-check
`ObsidianVideoView.kt` locally. `ObsidianCacheModule.kt` declared **two**
`companion object` blocks (`:14` and `:18`), which is a hard Kotlin compile
error (*"conflicting declarations"* — Kotlin permits exactly one per class).

It had stayed invisible because the Gradle build died at the CMake stage before
Kotlin was ever invoked. **It is a release blocker, not a smell** — once the
prefab fix from the 0.2.0 build work lands, this is the *next* build failure.
The plan had noted it as a footnote under FG-4.5; it is now its own Wave 0 item.

**Local verification is partial.** No NDK, no media3 in the Gradle cache, so the
Android module cannot be fully type-checked or linked here. What *was* verified:

- All 8 `.kt` files parse with zero syntax / redeclaration / **arity** errors. The
  arity check is meaningful: `ExoPlayerProvider.buildMediaSource` and
  `ObsidianMusicPlayerModule.Track` live in the same compilation unit as their
  call sites, so removing parameters would have surfaced as
  `too many arguments` / `no value passed`.
- `onVideoSizeChanged(VideoSize)` confirmed against the Media3 1.3.1 API reference
- `node --check plugin/index.js`, `npm run typecheck`, `npm run lint`, `npm test` all clean
- **Not verified:** Swift compilation (no `swiftc` on this host), Gradle
  configuration, manifest merging, and any on-device behaviour. Those need CI.

### Three more items were not in the original audit

Found while fixing the 0.3.0 Android build failure in a consumer app, and while
reviewing the Wave 4 media-session work. All three follow the pattern of the item
above: **something the plan assumed was covered, which was not.**

**1. FG-0.6 — nothing compiles this module.** The prefab fix the plan was waiting
on turned out to be two failures, not one. After `buildFeatures { prefab = true }`
made `find_package(ReactAndroid)` resolvable, the next failure was the STL:

```
[CXX1212] .../android/CMakeLists.txt release|arm64-v8a : User is using a static
STL but library requires a shared STL [//ReactAndroid/hermestooling]
```

`react-native-gradle-plugin` appends `-DANDROID_STL=c++_shared` only to
`com.android.application` projects (`NdkConfiguratorUtils.configureReactNativeNdk`
is gated on `withPlugin("com.android.application")`). A `com.android.library`
gets nothing, so AGP configured this module with the NDK default and prefab
rejected every `ReactAndroid` package built against the shared STL. Fixed with
`arguments "-DANDROID_STL=c++_shared"` in `defaultConfig.externalNativeBuild.cmake`
— not `stl "c++_shared"`, which is not a property of AGP's CMake DSL at all
(`ExternalNativeCmakeOptions` exposes only `path` and `version`; `stl` lives on
the unrelated `ndk` block). Shipped in `0.3.1`.

**This is the second time the build has hidden a compile error from this plan.**
The first was the duplicate `companion object`. Both were invisible for the same
reason, which is why it is now a Wave 0 item with its own CI gate rather than a
footnote.

**2. FG-4.0 — the Android service owns no player.** The plan's Wave 4 assumed
background playback worked and FG-4.1 was about the notification. It is about the
*ownership model*: `ObsidianPlaybackService` is a bare `Service` holding no
player, while the `MediaSession` is built from a player the React module owns
(`ObsidianMusicPlayerModule.kt:135`). So a JS reload stops the audio
(`invalidate()`, `:195`), process death re-posts a notification with no audio
behind it, and there is no session for `MediaButtonReceiver` or Android Auto to
reach. It also has no `AudioAttributes`, which means **no audio focus anywhere in
the package on either platform** — a gap neither the plan nor the original feature
blueprint had recorded.

**3. D5 — the DSP question.** An external feature blueprint proposed a native DSP
chain, a `QueueManager`, a ~28-event native bus and ~15 hooks, and described the
existing package as having "stubs" to replace. It has no DSP surface at all, and
it is already event-driven from JS rather than polling — so the two claims that
would have driven the estimate were both wrong. The blueprint is preserved as
[Appendix A](#appendix-a--vision-the-media-framework-roadmap) with its numbers
trimmed to what has an emitter on both platforms, and the DSP decision is
recorded as **D5** because on iOS it is an architecture choice (`AVPlayer` has no
insertable processing graph), not a feature.

---

## Legend

| Field | Values |
|---|---|
| **Severity** | `CRASH` · `SILENT-WRONG` · `DEAD-API` · `PARITY` · `FEATURE` · `BUILD` |
| **Effort** | `S` (< 1h) · `M` (1–4h) · `L` (1–3d) |
| **Platform** | `AND` · `IOS` · `WEB` · `JS` · `BUILD` |

`CRASH` and `SILENT-WRONG` are the only two that can ship a broken experience to
end users. `DEAD-API` means the public surface advertises something that does
nothing. `PARITY` means one platform works and the other does not. `FEATURE` is
net-new capability, not a bug. `BUILD` means the module cannot be built, linted
or verified at all — it is not a user-facing defect, but nothing downstream of it
can be checked, so it gates everything else.

---

## Decisions — RESOLVED

These four changed the shape of the work. All were answered on 2026-09-27.

| # | Question | Decision | Consequence |
|---|---|---|---|
| **D1** | Support the **Old Architecture** (Paper) on iOS? | **(a) Drop it.** iOS now requires `RCT_NEW_ARCH_ENABLED=1`. | FG-3.1 collapses from "add `RCT_EXTERN_MODULE` shims" to **verify + fail loudly**. FG-3.3 reduces to documenting interop-only support. The podspec drops `RCT-Folly` and `React-RCTAppDelegate` (FG-3.2). |
| **D2** | Keep `MediaSourceType: 'smooth'`? | **(b) Remove it.** | FG-0.4a becomes a deletion. No new Gradle dependency. Breaking TS change. |
| **D3** | `onVideoReady` — implement or delete? | **(b) Delete it.** | FG-0.4b becomes a deletion. No native code referenced it. Breaking TS change. |
| **D4** | Is **DRM** shipping? | **(b) Not now.** Remove `drmLicenseUri` from `MediaSource` and stop advertising DRM. | **FG-6.1 and FG-6.2 are struck.** This also touches `package.json:4` and all four native load paths. New item **FG-6.5**. |

> Every "keep it" answer would have converted a small honest deletion into a
> large half-built feature. Deleting is the cheaper, safer path, and the public
> API becomes trustworthy as a side effect.
>
> **Net effect on the plan:** 2 items struck, 3 reduced in scope, 1 added.
> D2 + D3 together are one breaking release, so they ship as `0.3.0` alongside
> FG-0.4c (`onBuffering`, which is implemented rather than removed).

---

## Decision outstanding — D5

**Question:** does the audio pipeline get a native DSP graph (EQ, ReplayGain,
loudness, effects, analysis)?

**Status:** **UNRESOLVED.** Not scheduled, not estimated in any wave, and
deliberately kept out of Wave 6. Recorded here because it is the one decision
that determines the shape of everything in Appendix A, and it cannot be made by
picking a feature off a list.

**The facts that constrain it**

- **There is no DSP surface today, and no stubs to replace.** A repo-wide search
  for `equalizer|EQ|dsp|crossfade|gapless|ReplayGain|waveform|FFT|preamp|
  compressor|reverb|limiter|pitch` across `.ts`/`.tsx`/`.kt`/`.swift`/`.cpp`
  returns nothing. This is greenfield, which is why it cannot be sized by
  comparison to anything already in the repo.
- **iOS is the expensive half, and the reason is architectural.** iOS plays
  through `AVPlayer` (`ObsidianMusicPlayerModule.swift:7`,
  `ObsidianAudioEngine.swift` — the filename says engine, the code is a wrapper
  around `AVPlayer`). **`AVPlayer` has no insertable audio processing graph.**
  `MTAudioProcessingTap` gives analysis only. Anything that modifies the signal
  means moving to `AVAudioEngine` plus manual demux and decode — which gives up
  the HLS, DASH, gapless and DRM handling that AVFoundation currently provides
  for free.
- **Android is the cheap half.** Media3 exposes an `AudioProcessor` chain via
  `DefaultAudioSink.Builder.setAudioProcessors`, with `Equalizer`,
  `LoudnessEnhancer` and `BaseToneAudioProcessor` already in `media3-common`. No
  rewrite, no custom decoder.
- **Analysis is not free on either platform.** FFT/bandwidth analysis needs a
  `TeeAudioProcessor` and access to raw PCM; Media3 ships no public FFT and the
  internals are `@UnstableApi`. It also inherits the iOS constraint above.
- **ReplayGain is two different projects.** Reading embedded ReplayGain tags is
  a day of metadata parsing. *Calculating* loudness (LUFS, true peak) is a
  measurement pass that must decode every file, plus a gain stage to apply the
  result at playback. They must not be costed as one item.
- **"Bit-perfect" and "a DSP chain" are in tension.** Bit-perfect means no
  resampling, no volume control, no processing — so the entire chain has to be
  bypassable, and on iOS it also has to avoid the `AVAudioEngine` mixer, which
  forces conversion to the hardware sample rate. A flagship audiophile feature
  that fights the architecture is a bad flagship feature. Pick a default path
  and document it.

**Options**

| | Option | Cost | Consequence |
|---|---|---|---|
| **(a)** | No DSP | zero | EQ/ReplayGain/analysis stay absent. Honest, and costs nothing. |
| **(b)** | Android-only DSP via the Media3 `AudioProcessor` chain | S–M | Real EQ, loudness and effects on Android; iOS unchanged. Honest asymmetry, but a cross-platform package with a flagship feature on one platform is a support burden. |
| **(c)** | `AVAudioEngine` rewrite on iOS | XL | Full parity. Forfeits AVFoundation's HLS/DASH/gapless, which must then be rebuilt. Weeks to months, on top of FG-4.0. |

**Recommendation: (b) as a bounded spike, and explicitly not (c).**

Take (b) only if it can be done behind an honest API that says which platforms
support what — `PlayerCapabilities` rather than a method that silently no-ops.
The spike's question is not "can we add an EQ"; it is "does the
`AudioProcessor`-chain approach hold up well enough that (c) is never needed to
answer a real user request". If (c) is required for parity, the answer is a
product decision about whether this package is a media *framework* or a
well-behaved player — and that is D1's question again, asked about audio instead
of video.

**Do not start this until** FG-0.6 (a build that can be verified), FG-4.0 (a
service that owns its audio path) and Waves 0–5 are merged. DSP is the most
expensive item in Appendix A and the least likely to be what a consumer of an
offline music player is actually blocked on.

---

## Gap summary

| ID | Gap | Severity | Effort | Platform |
|---|---|---|---|---|
| FG-0.1 | Android 14+ foreground service throws `SecurityException` | `CRASH` | S | AND |
| FG-0.2 | Android video `resizeMode` is an empty method body | `SILENT-WRONG` | M | AND |
| FG-0.3 | iOS video `repeat` no-op; `resizeMode:'none'` falls back to `contain` | `SILENT-WRONG` | S | IOS |
| FG-0.4 | Declared-but-inert props (`smooth`, `onVideoReady`, `onBuffering`) | `DEAD-API` | M | ALL |
| FG-0.5 | Duplicate `companion object` — hard Kotlin compile error | `CRASH` | S | AND |
| FG-0.6 | Native build has never been verified end-to-end — two compile errors shipped behind a CMake failure | `BUILD` | M | BUILD |
| FG-0.7 | Advertised `react-native >= 0.73` was never compilable — real floor is 0.74 | `DEAD-API` | S | BUILD |
| FG-1.1 | `MediaProvider` returns `null` controls forever | `DEAD-API` | M | JS |
| FG-1.2 | `useVideoPlayer().state` is a frozen constant | `DEAD-API` | S | JS |
| FG-1.3 | `Video.getState()` reads a stale closure | `DEAD-API` | M | JS |
| FG-1.4 | Music end-of-queue `onEnded` is emitted but never received | `DEAD-API` | S | JS |
| FG-1.5 | `VideoHandle` duplicated between `Video.tsx` and `Video.web.tsx` — drifts silently | `DEAD-API` | XS | JS |
| FG-1.6 | All 3 hooks double-count native `addListener`/`removeListeners` | `DEAD-API` | XS | JS |
| FG-2.1 | No `MusicPlayer` web build — importing the package breaks web bundling | `CRASH` | M | WEB |
| FG-2.2 | Web: `MediaSource.headers` cannot be set on `<video>`/`<audio>` | `PARITY` | M | WEB |
| FG-2.3 | Web: no `navigator.mediaSession` / remote controls | `PARITY` | M | WEB |
| FG-2.4 | Web: no real offline download (CacheStorage is best-effort) | `PARITY` | M | WEB |
| FG-3.1 | iOS modules never call `RCT_EXPORT_MODULE` | `CRASH` | M | IOS |
| FG-3.2 | Podspec declares app-target pods as library deps | `BUILD` | S | BUILD |
| FG-3.3 | No Fabric component view; video is Paper + interop only | `PARITY` | L | IOS |
| FG-4.0 | The foreground service owns no player — Android "background playback" is not background playback | `SILENT-WRONG` | L | AND |
| FG-4.1 | Android lock-screen controls are inert (no `MediaStyle`, no actions) | `PARITY` | L | AND |
| FG-4.2 | Android music never emits `onProgress` | `PARITY` | S | AND |
| FG-4.3 | Android `setRemoteControls` discards its argument | `PARITY` | M | AND |
| FG-4.4 | `removeTrack` restarts playback unconditionally | `SILENT-WRONG` | S | AND/IOS |
| FG-4.5 | Android `removeDownload` frees no bytes; `clearCache` is unsafe | `SILENT-WRONG` | M | AND |
| FG-5.1 | Downloads are never consulted at playback time | `FEATURE` | M | ALL |
| FG-5.2 | No download progress; `bytesTotal` is never meaningful | `DEAD-API` | M | AND/IOS |
| FG-5.3 | iOS HLS download reports `"done"` after a hardcoded 2 s | `SILENT-WRONG` | M | IOS |
| FG-5.4 | Android `prefetchToCache` blocks a thread for the whole file | `SILENT-WRONG` | M | AND |
| FG-5.5 | `getDownloads()` / `getCacheSize()` shapes differ per platform | `PARITY` | M | AND/IOS |
| FG-6.1 | ~~DRM — Widevine~~ **STRUCK (D4b)** | — | L | AND |
| FG-6.2 | ~~DRM — FairPlay~~ **STRUCK (D4b)** | — | L | IOS |
| FG-6.5 | `MediaSource.drmLicenseUri` is declared but discarded everywhere | `DEAD-API` | S | ALL |
| FG-6.3 | Casting (Chromecast / AirPlay) | `FEATURE` | L | ALL |
| FG-6.4 | `Track.artwork` and `Track.duration` are decoded then discarded | `DEAD-API` | M | ALL |
| FG-7.1 | `PlaybackState.inBackground` is permanently `false` | `DEAD-API` | S | ALL |
| FG-7.2 | Expo plugin requires `@expo/config-plugins` undeclared | `BUILD` | S | BUILD |
| FG-7.3 | Test coverage is one 53-line file | `BUILD` | L | JS |

---

## Wave 0 — Release blockers

Small, self-contained, independently shippable. **Nothing else starts until this
wave is on `main`.**

### FG-0.1 — Android 14+ foreground service throws

**Severity:** `CRASH` · **Effort:** S · **Platform:** AND

**Current behavior**
`android/src/main/AndroidManifest.xml:11` declares
`android:foregroundServiceType="mediaPlayback"` but the manifest only requests
`android.permission.FOREGROUND_SERVICE` (`:3`). On API 34+ a `mediaPlayback`
foreground service additionally requires
`android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`; without it,
`ObsidianPlaybackService.startForeground()` (`ObsidianPlaybackService.kt:30`)
throws `SecurityException`.

`ObsidianMusicPlayerModule.setBackgroundEnabled` (`:174-186`) calls
`startForegroundService()` unconditionally, and `<MusicPlayer>` calls
`setBackgroundEnabled(true)` on every mount (`MusicPlayer.tsx:53-56`) — so
**every** Android 14+ user hits this the moment a `MusicPlayer` mounts.

> This became live with the 0.2.0 `targetSdk` 34 → 36 bump. Before that the
> requirement did not apply.

**Implementation flow**
1. Add `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />` to `android/src/main/AndroidManifest.xml`, alongside the existing `FOREGROUND_SERVICE` at `:3`.
2. Update the Permissions section of `README.md:46-50` — it currently tells consumers to add only `POST_NOTIFICATIONS`.
3. Verify `plugin/index.js:24-30` needs no change. It is a deliberate no-op (`// Library manifest already declares…`) and merging library manifests propagates the permission to the app automatically. Add a comment saying so, so nobody "fixes" it later.

**Verification**
- [ ] `./gradlew :obsidian-media-player:processReleaseManifest` — merged manifest contains `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. Now covered by `npm run verify:android:host`, which runs the release build including manifest merging, but that job has not run yet (FG-0.6)
- [ ] On an API 34+ emulator, mount `<MusicPlayer>` and confirm no `SecurityException` in logcat
- [ ] Confirm the playback notification still appears

**Risk:** None. Additive permission only.

---

### FG-0.2 — Android video `resizeMode` does nothing

**Severity:** `SILENT-WRONG` · **Effort:** M · **Platform:** AND

**Current behavior**
`ObsidianVideoView.setResizeMode` has an empty body:

```kotlin
fun setResizeMode(mode: String) { /* TextureView scale: contain/cover handled by matrix */ }
```

(`android/src/main/java/com/obsidianmediaplayer/video/ObsidianVideoView.kt:95`).
`cover` and `stretch` are accepted, stored nowhere, and produce identical output
to `contain`. The prop is in the public type (`src/types.ts:123`) and the README
documents it as working (`README.md:238`).

**Implementation flow**
1. Add a `resizeMode: String` field to `ObsidianVideoView`, set inside `setResizeMode`, and call an `applyResizeMode()` from it and from `onSizeChanged`.
2. `contain` / `cover` → `Matrix().apply { setScale(sx, sy, cx, cy) }` centred on the video size, matching the iOS behaviour at `ObsidianVideoPlayer.swift:93-99`. `cover` overflows and clips; `contain` letterboxes.
3. `stretch` → identity matrix (video fills the view, aspect distorted).
4. `none` → fit-to-view with no scaling, i.e. `setScale(1f, 1f)` centred. This is what `ResizeModeType` (`src/specs/NativeObsidianVideo.ts:12`) already declares.
5. Apply the matrix to `textureView` via `textureView.setTransform(matrix)`.
6. Read dimensions from `player.videoSize` inside `Player.Listener.onVideoSizeChanged(VideoSize)`; re-apply on `surfaceTextureUpdated` and in `onAttachedToWindow` (`:118-121`), because `videoSize` is 0×0 until the first frame arrives.
7. Guard the aspect ratio: `videoSize.width`/`height` are 0 before first frame and after `onError` — early-return rather than divide by zero.

**Verification**
- [ ] A 4:3 video in a 1:1 container renders identically on Android and iOS for all four modes
- [ ] A live HLS stream that changes resolution mid-playback re-lays out correctly
- [ ] Portrait/landscape rotation does not distort

**Risk:** `setTransform` interacts with RN's own layout transform on the same
view. If the host app applies a `transform` style to `<Video>`, ours is
overwritten. Note this in the README rather than trying to merge them.

---

### FG-0.3 — iOS video `repeat` is inert; `resizeMode:'none'` misbehaves

**Severity:** `SILENT-WRONG` · **Effort:** S · **Platform:** IOS

**Current behavior**
- `ObsidianVideoView.setRepeat` is an empty body with a comment
  (`ios/Video/ObsidianVideoView.swift:50`). `ObsidianVideoPlayer.itemDidEnd`
  (`:158-162`) unconditionally sets `"ended"` and fires `onEnded` — the player
  never loops. Android's equivalent works (`ObsidianVideoView.kt:96`).
- `applyResizeMode` (`ObsidianVideoPlayer.swift:93-99`) handles `cover` and
  `stretch`; everything else hits `default: .resizeAspect` (`:97`), so `'none'`
  silently behaves as `contain`.

**Implementation flow**
1. Add `private(set) var repeat = false` to `ObsidianVideoPlayer`; set it in a `setRepeat(_:)` method.
2. In `itemDidEnd` (`ObsidianVideoPlayer.swift:158`), when `repeat` is true: `player.seek(to: .zero); player.play()` and return without emitting `onEnded` or `"ended"`. When false, keep today's behaviour exactly.
3. Wire `ObsidianVideoView.setRepeat` to `media.setRepeat(repeatMode)`.
4. Add an explicit `case "none": layer.videoGravity = .resize` — `AVPlayerLayer` has no "no scaling" mode, so `.resize` (fill the layer, no aspect correction) is the closest honest match. Document the approximation in the README.
5. Mirror the Android `Matrix` behaviour note in the README so the two platforms are described as equivalent.

**Verification**
- [ ] `repeat` on a 30 s clip loops indefinitely on iOS **and** Android with identical event sequences
- [ ] `repeat` off still emits `onEnded` exactly once
- [ ] `resizeMode="none"` visibly differs from `"contain"`

**Risk:** Low. Behaviour change is scoped to `repeat === true`, which currently
does nothing, so no consumer can regress.

---

### FG-0.4 — Remove or implement the declared-but-inert props

**Severity:** `DEAD-API` · **Effort:** M · **Platform:** ALL

Three things are in the public API and the README that no platform implements.
Leaving them is worse than either alternative, because consumers will build on
them. Resolved by **D2** and **D3**.

**FG-0.4a — `MediaSourceType: 'smooth'` (per D2)**
- *If D2(b), delete:* remove `'smooth'` from `src/types.ts:9`; delete the
  `"smooth" ->` branch and the commented-out `SsMediaSource` line from
  `ExoPlayerProvider.kt:118-119`; delete README roadmap row 3 (`README.md:370`).
  This is a breaking type change → minor bump to `0.3.0`.
- *If D2(a), implement:* add `implementation("androidx.media3:media3-exoplayer-smoothstreaming:1.3.1")` to `android/build.gradle:152-155`, add the `SsMediaSource.Factory` branch, and document that iOS silently falls back to progressive.
- Either way, the `else -> ProgressiveMediaSource` fallback at
  `ExoPlayerProvider.kt:130` must keep working — it is what keeps an unknown
  `type` from crashing playback.

**FG-0.4b — `onVideoReady` (per D3)**
- *If D3(b), delete:* remove from `src/specs/NativeObsidianVideo.ts:37`. No
  native code references it, so deletion is clean.
- *If D3(a), implement:* Android — fire from `Player.Listener.onVideoSizeChanged`
  using the same `VideoSize` already needed for FG-0.2, and add
  `onVideoReady` to `getExportedCustomDirectEventTypeConstants`
  (`ObsidianVideoManager.kt:51-58`), which currently omits it. iOS — fire from
  `AVPlayerItem.presentationSize` observation. Web — `onLoadedMetadata`.

**FG-0.4c — `onBuffering` (implement — no decision needed)**
It is declared at `NativeObsidianVideo.ts:34`, registered at
`ObsidianVideoManager.kt:57` and held as an iOS prop
(`ObsidianVideoView.swift:10`), but **never invoked natively**. Only web emits
it (`Video.web.tsx:72`).
- Android: add `onBuffering` callback to `ObsidianVideoView` (alongside the
  existing four at `:20-23`) and fire it from
  `onPlaybackStateChanged(STATE_BUFFERING)` (`:49`).
- iOS: fire from `AVPlayerItem.isPlaybackLikelyToKeepUp` /
  `loadedTimeRanges` KVO in `observeValue` (`:151-155`), throttled to one emit
  per transition so it does not fire on every 250 ms tick.
- Web already works — leave `Video.web.tsx:72` alone.

**Verification**
- [x] Grep confirms no remaining references to deleted symbols — `'smooth'` and
      `onVideoReady` survive only in changelog prose and the note in
      `src/types.ts:13` recording the removal. No live code, no spec, no README
      API table
- [x] README roadmap and Permissions sections match the new behaviour
- [ ] `npm run typecheck` and `npm run lint` clean
- [ ] `npm test` green

**Risk:** FG-0.4a(b) and FG-0.4b(b) are breaking for TypeScript consumers →
`0.3.0`, not a patch.

---

### FG-0.5 — Duplicate `companion object` blocks (DONE)

**Severity:** `CRASH` · **Effort:** S · **Platform:** AND
*(found during FG-0.2; promoted out of FG-4.5)*

**Current behavior**
`ObsidianCacheModule.kt` declared two `companion object` blocks, at `:14`
(`NAME`) and `:18` (`PREFS`, `KEY_INDEX`). Kotlin permits exactly one companion
object per class, so the compiler reports:

```
error: conflicting declarations
```

This is a **hard build failure**, not a lint smell. It went unnoticed because
the Gradle build aborted at the CMake/`find_package` stage before the Kotlin
compile task ever ran — the earlier failure was masking this one.

**Implementation flow**
1. Merge both blocks into a single `companion object` retaining all three
   constants. *(done)*
2. Re-run the module-wide Kotlin parse to confirm zero conflict diagnostics.
3. Note that this is a class of bug the current toolchain cannot catch: any
   compile error in the Kotlin sources is invisible while the native build is
   broken. Once CI runs a full `assembleRelease`, the ordering problem is
   resolved automatically.

**Verification**
- [x] Zero `conflicting declarations` / `redeclaration` diagnostics across all
      8 `.kt` files
- [x] All three constants (`NAME`, `PREFS`, `KEY_INDEX`) still resolve in-file
- [ ] `./gradlew :obsidian-media-player:compileReleaseKotlin` — the job now
      exists (`verify:android:host` runs `assembleRelease`, which depends on it)
      but has never executed

**Risk:** None. Pure consolidation.

---

### FG-0.6 — Nothing has ever compiled the native module

**Severity:** `BUILD` · **Effort:** M · **Platform:** BUILD
*(found while fixing the 0.3.0 CMake failure; the reason two compile errors reached a published release)*

**Current behavior**
There is no CI job that builds this module. `0.3.0` shipped with two hard Kotlin
compile errors, and the only reason they were found at all is that the author was
reading the source:

1. **The duplicate `companion object` (FG-0.5).** Kotlin permits one per class.
2. **The CMake/prefab failure chain.** `find_package(ReactAndroid)` needs
   `buildFeatures { prefab = true }` in `android/build.gradle`; with that fixed,
   AGP still configures the module with the NDK default STL and prefab rejects
   every `ReactAndroid` package built against the shared STL —
   `CXX1212 … User is using a static STL but library requires a shared STL
   [//ReactAndroid/hermestooling]`.

**Both were invisible for the same reason: the build died before the compiler ran.**
Gradle aborts at `configureCMakeRelWithDebInfo`, so `compileReleaseKotlin` is
never reached, so a Kotlin syntax error cannot surface. The CMake error *masked*
the Kotlin error. Any error class is equally masked — a bad Swift file, a missing
resource, a wrong media3 version, an unresolvable dependency.

iOS is in the same position. FG-3.1 step 1 says "**verify first**" and is blocked
on being able to build, and FG-3.2's `pod lib lint` has never been run.

FG-7.3 asks for a JS CI job. It is necessary and not sufficient: `npm test` cannot
see a single line of the ~1,100 lines of Kotlin and ~1,100 of Swift in this module.

**Implementation flow**
1. Add a CI job running `./gradlew :obsidian-media-player:assembleRelease` against
   the host app's `android/` directory. It needs the app, not the library alone —
   the module resolves `ndkVersion`, `compileSdkVersion` and the ABI list from
   `rootProject.ext` (`android/build.gradle:21-27`), so it must be built in
   autolinking context.
2. Add `pod lib lint --allow-warnings` for iOS, and treat its warnings as a
   reviewed list rather than something to silence blindly.
3. Keep the FG-7.3 JS job alongside it. Three gates: typecheck+lint+test, Android
   assemble, iOS pod lint.
4. Cache the NDK and `~/.gradle/caches` — the first run downloads the NDK, CMake
   3.22.1 and media3, and an uncached job is the kind of timeout that gets
   disabled "temporarily" and then forgotten.
5. Prove the gate works: introduce a deliberate Kotlin syntax error, confirm CI goes
   red, then revert. A gate that has never failed is not a gate — the same
   discipline as "Verifying the regression tests" below.

**Outcome — the local half is done; the CI half is not.**

`npm run verify:android` (`scripts/verify-android-kotlin.mjs`) now type-checks all
8 `.kt` files against real `react-android` and `androidx.media3` artifacts in
~90 s, with **no NDK, no CMake, no Gradle, no host app and no device**. It
downloads the AARs, extracts `classes.jar` from each, and runs
`K2JVMCompiler` directly.

**It immediately found a shipped bug** — see **FG-0.7**. Before that fix it had
never once reported anything, because nothing had ever compiled these files.

**The version matrix is the part that matters.** A single-version check is a lie:
this module compiles clean against RN 0.74 and 0.80 while failing outright
against 0.73 — the version `package.json` claimed to support. Two further
details that cost real time and are now handled:

- RN 0.78+ is published with **Kotlin 2.x metadata**, which a 1.9 compiler
  refuses to read. Each target therefore carries its own compiler, stdlib and
  coroutines version.
- The cache is shared across runs, so every version-pinned jar
  (`kotlin-stdlib-*`, `kotlinx-coroutines-core-jvm-*`, `react-android-*`) must be
  filtered out of the compile classpath and re-added per target. A leftover
  `kotlin-stdlib-2.1.0.jar` makes the 0.74 target fail with *"binary version of
  its metadata is 2.1.0, expected 1.9.0"* — a harness failure masquerading as a
  source failure.

**The harness has its own self-test, and it earned its place immediately.** The
first version of the script reported **OK for a build that never ran**: the
compiler jar was downloaded but never copied onto the launch classpath, so `java`
exited with *"Could not find or load main class"*, which matched no error pattern
and read as "zero errors". The gate now requires positive proof of work — exit 0
*and* class files on disk — and reports a harness bug distinctly from a source
error. Verified to fail correctly on an unresolved type and on a wrong-arity call,
and to pass when reverted.

**What this still does not cover:** manifest merging, resource linking, the
CMake/NDK compilation of `OnLoad.cpp`, `pod lib lint`, and all runtime
behaviour. Steps 1-2 above are still required; this is the fast inner loop, not
the gate.

**Outcome — the local half works, the CI half is written but unproven.**

`npm run verify:android` (`scripts/verify-android-kotlin.mjs`) type-checks all
8 `.kt` files against real `react-android` and `androidx.media3` artifacts in
~90 s, with **no NDK, no CMake, no Gradle, no host app and no device**.

The CI half is `.github/workflows/ci.yml`, in three jobs:

| Job | Command | Covers |
|---|---|---|
| `js` | `npm run verify` | typecheck, lint, 156 tests, web bundle |
| `android` | `npm run verify:android`, then `npm run verify:android:host` | the Kotlin matrix, then manifest merging, resource linking and the CMake/NDK compile of `OnLoad.cpp` |
| `ios` | `npm run verify:ios` | `pod lib lint --allow-warnings` |

Both native gates are scripts, not inline YAML, so a macOS/Android developer
reproduces a red run without reading the workflow, and the argument choices —
`--allow-warnings`, one ABI, no `--configuration-cache` — are reviewable code
rather than buried flags.

**The host app is scaffolded, not checked in.** `verify:android:host` runs
`@react-native-community/cli@14.1.2 init` into a temp directory, adds this module
as a `file:` dependency, and runs `:obsidian-media-player:assembleRelease`
inside it. Checking `example/android/` in would mean ~25 files of generated
boilerplate that have to track every RN template change, and a stale copy would
test nothing except its own staleness. The module genuinely cannot be built
standalone — `android/build.gradle:21-27` resolves `ndkVersion`, `compileSdkVersion`
and the ABI list from `rootProject.ext` — so a host app is a requirement of the
gate, not a convenience.

**The Gradle gate requires an AAR on disk, not just exit 0.** Same lesson as the
Kotlin harness above: a build that exits 0 having compiled nothing is not a pass.

**Step 5 is `npm run verify:gates`.** It injects a known-bad input into each
gate, asserts the gate exits non-zero *and* that the output contains the
expected error signature, then restores the file. The signature check is the
point — a gate that is red because `npm` is missing has proven nothing about the
code. Probes are additive files wherever possible; the two that must edit real
sources (`src/index.ts` for the web graph, `android/CMakeLists.txt` for the
CMake probe) are backed up and restored in a `finally`, and the script refuses
to start on a dirty tree so an interrupted run cannot revert your work.
`--full` adds the Gradle and pod probes. CI runs the fast subset.

**Unproven:** none of this has executed. The workflow has never run, so the red
probes for the Gradle and pod jobs are unverified assertions about a build
nobody has watched. Treat the first CI run as the real test of this item.

**Verification**
- [x] `npm run verify:android` — both matrix targets compile
- [x] Gate goes red on an injected unresolved type
- [x] Gate goes red on an injected arity error
- [x] Gate reports a *harness* failure distinctly from a source failure
- [x] Restoring the sources returns it to green
- [x] `.github/workflows/ci.yml` defines all three gates
- [x] `npm run verify:gates` asserts each gate goes red for the right reason
- [ ] `.github/workflows/ci.yml` run green on a real push
- [ ] `verify:android:host` green end to end (needs an NDK + CMake run)
- [ ] `verify:ios` green (`pod lib lint` has never been run against this podspec)

**Risk:** The local gate can rot — it pins media3 1.3.1, `android-35` and a
two-version RN matrix by hand, so bumping `android/build.gradle` will silently
invalidate it. Add it to the Definition of Done: *if you change a dependency
version, update the matrix or the gate stops being evidence.*

---

### FG-0.7 — The advertised RN floor was never real

**Severity:** `DEAD-API` · **Effort:** S` (done) · **Platform:** BUILD
*(found by FG-0.6's local gate, on its first honest run)*

**Current behavior**
`package.json` declared `peerDependencies: { "react-native": ">=0.73.0" }` and
the README repeated `react-native >= 0.73`. But
`ObsidianMediaPlayerPackage.kt:25` extends `BaseReactPackage`, and that class
**does not exist before RN 0.74**:

| react-android | `BaseReactPackage` | `TurboReactPackage` | this module |
|---|---|---|---|
| 0.73.6 | absent | present | **6 compile errors** |
| 0.74.0 | present | present | compiles clean |
| 0.80.0 | present | present (deprecated shim) | compiles clean |

So an app on RN 0.73 did not get a degraded experience — it got a hard Gradle
failure, from a package that claimed to support it. This shipped in `0.3.0` and
`0.3.1`.

`BaseReactPackage` was introduced in **0.74.0** and `TurboReactPackage` was
reduced to an empty deprecated subclass of it (`abstract class TurboReactPackage
: BaseReactPackage() {}`) by 0.80. So "just use `TurboReactPackage` to keep 0.73"
was rejected: it would keep 0.73 nominally supported by relying on a deprecated
shim that is scheduled to disappear, to preserve support that was never real.

**Implementation flow**
1. Raise the peer floor to `>=0.74.0` in `package.json`. *(done)*
2. Update the README requirements line. *(done)*
3. Keep the RN version matrix in FG-0.6's gate, so this class of claim is
   *checked* rather than asserted. A single-version compile proves nothing about
   a peer range — that is the actual lesson. *(done)*
4. Move `devDependencies.react-native` to `0.74.7` and drop
   `@types/react-native`. *(done)* There is no `0.74` of that package — the
   series **stops at 0.73.0**, which is a stub whose own deprecation notice says
   *"react-native provides its own type definitions, so you do not need this
   installed."* RN 0.74.7 ships `types`, so the stub was buying nothing and
   pinning the toolchain below the floor. `example/package.json` moved to match.
   This widens the type surface: with a stub, every `react-native` import was
   effectively `any`, so real RN types may surface genuine errors in `src/` that
   `tsc` has never had a chance to report.
5. Still open: nothing. The earlier decision to defer this to the RN upgrade was
   reversed once it was clear the stub types were doing no work.

**Verification**
- [x] `npm run verify:android` compiles clean on 0.74.0 and 0.80.0
- [x] `package.json` and the README both say `>=0.74`
- [x] `devDependencies.react-native` = `0.74.7`; `@types/react-native` removed
- [ ] `npm install && npm run verify` after the dependency change — the stub
      types were masking the whole `react-native` surface, so this is the step
      that could surface real type errors

**Risk:** None to consumers — it removes a support claim that could not be
honoured. Anyone who was pinned to 0.73 by this package was already broken.

---

## Wave 1 — Public API correctness

The JS layer advertises behaviour it does not deliver. No native changes, so this
wave is fast and testable without a device.

### FG-1.1 — `MediaProvider` returns `null` controls forever

**Severity:** `DEAD-API` · **Effort:** M · **Platform:** JS

**Current behavior**
`src/context/MediaProvider.tsx:70`:

```tsx
controls: ref.current as MusicPlayerHandle,
```

`ref.current` is `null` on the first render, and the context value is rebuilt on
every render but the ref is never re-read into state — so `useMedia().controls`
is `null` for the lifetime of the provider. `snapshot.state` is initialised at
`:54` from `ref.current?.getState() ?? ({} as PlaybackState)`, so it starts as
`{}` and only ever updates from `onEvent`, which `<MusicPlayer>` fires **solely
on `state.status` change** (`MusicPlayer.tsx:61-64`) — position, duration,
buffered and volume never update.

`useMedia()` is exported from `index.ts:20` and documented in the README.

**Implementation flow**
1. Add `const [controls, setControls] = useState<MusicPlayerHandle | null>(null)` and a `useEffect` that reads `ref.current` after mount and calls `setControls`. The `useEffect` runs after the child's `useImperativeHandle`, so `ref.current` is populated.
2. Gate every `useMedia()` consumer on `controls` being non-null — either throw a clear error, or return a no-op controls object so SSR and the first render do not explode. Prefer the explicit error: `throw new Error('MediaProvider is not ready yet.')`.
3. Seed `snapshot` with `INITIAL_STATE` from `src/utils/media.ts:20` instead of `{}`, so `usePlaybackState(snapshot.state)` is safe on first render.
4. Fix the state feed: `MusicPlayer` must emit `onEvent` on **every** state change, not only on `status`. Change the effect dependency in `MusicPlayer.tsx:61-64` from `[state.status]` to `[state]`, or better — have `useMusicPlayer` expose the full state and pass it up directly.
5. Re-verify `toggle()` (`:61-65`): it calls `ref.current?.getState()` from a `useCallback` with `[]` deps. The ref is stable so this reads the live handle, but it now works only once FG-1.3 lands (otherwise it reads a stale closure).

**Verification**
- [ ] `useMedia().controls.play()` works on first tap, with no null guard needed in app code
- [ ] `useMedia().state.position` advances while playing
- [ ] `usePlaybackState(useMedia().state)` reports `isPlaying: true` during playback
- [ ] New unit test with a mocked `MusicPlayerNative`

**Risk:** Changing `onEvent` to fire on every state change (step 4) increases
emission rate on all three players. Gate on reference equality
(`if (next !== prev)`) to avoid re-render storms.

---

### FG-1.2 — `useVideoPlayer().state` is a frozen constant

**Severity:** `DEAD-API` · **Effort:** S · **Platform:** JS

**Current behavior**
`src/hooks/useVideoPlayer.ts:21` is `const state = INITIAL_STATE;` — not a
`useState`. The returned `state` never changes, so
`usePlaybackState(useVideoPlayer().state)` reports `idle` forever. The hook is
exported at `index.ts:10` and its doc comment shows the intended usage.

**Implementation flow**
1. Make `useVideoPlayer` a real stateful hook: `const [state, setState] = useState(INITIAL_STATE)`.
2. It cannot subscribe to the native view directly (the native surface is a child component). Two options:
   - **(a) Preferred:** accept a subscription callback — `useVideoPlayer({ onState })` — and have the caller forward `Video`'s `onStateChange` into it. Explicit, no hidden coupling, but the caller must wire it.
   - **(b)** `useSyncExternalStore` against a small module-level store that `Video.tsx` publishes to. Automatic, but introduces shared global state and breaks with two `<Video>` elements on screen.
3. Go with **(a)**, and additionally expose `useVideoPlayer.setExternalState(next)` so `Video`'s `onStateChange` can push into the hook without prop drilling.
4. Fix the `controls` `useMemo` at `:23-36` — its dependency array is `[state]`, which recreates all nine closures on every state tick. With a real `useState` this becomes a per-frame allocation. Depend on `[]` and read the ref.

**Verification**
- [ ] `useVideoPlayer().state.status` transitions `idle → loading → playing`
- [ ] `controls` object identity is stable across renders (assert with `toBe`)
- [ ] Two independent `useVideoPlayer` instances do not interfere

**Risk:** Option (b) is a trap with multiple `<Video>` elements on one screen —
prefer (a) even though it costs the caller one prop.

---

### FG-1.3 — `Video.getState()` reads a stale closure

**Severity:** `DEAD-API` · **Effort:** M · **Platform:** JS
*(supersedes README roadmap row 9, `README.md:376`)*

**Current behavior**
`src/components/Video.tsx:53-64` builds the imperative handle with
`getState: () => state`, capturing the `state` from that render. The
`useImperativeHandle` dep array includes `state`, so the handle is rebuilt on
each tick — but a caller who stored the handle once, or who calls `getState()`
inside a stale closure, reads a value that lags the native player by up to one
emission interval (250 ms).

**Implementation flow**
1. Add `const stateRef = useRef(state)` and `stateRef.current = state` on every render (or via an effect — the render-time assignment is fine and cheaper).
2. `getState: () => stateRef.current` reads the live value regardless of when the handle was captured.
3. Align the three handle types on one shape. `VideoHandle.getState` and `AudioHandle.getState` are synchronous; `MusicControls.getState` and `AudioControls.getState` return a `Promise`. Pick **sync-from-cache** for the `Handle` interfaces (imperative, must be immediate) and keep the async native round-trip on the `Controls` interfaces only. Document the distinction in `src/types.ts`.
4. Add `flush()` to the handle — a Promise that resolves after the next state emission — for callers that need a native-fresh value rather than the cached one.

**Verification**
- [x] A handle captured in a `useEffect(…, [])` still returns current position
- [x] `getState()` and `getState()` after a `seek` agree with `onProgress`
- [x] Type-level test that `VideoHandle` and `MusicControls` do not silently diverge
- [x] `flush()` resolves on the next emission, and via timeout when nothing plays

**Risk:** Low, additive.

**Outcome.** Implemented on all three components, not just `<Video>`. The same
`stateRef` pattern was applied to `MusicPlayer.tsx` (plus a `queueRef`, since
`getQueue()` had the identical problem) and to `Audio.tsx` — `<Audio>` had both
defects and additionally a dead ternary,
`state.status === 'playing' ? 'state' : 'state'`, whose branches were identical.
`Audio.web.tsx` already used a `stateRef` and needed no change; that asymmetry is
what made the native `Audio` look wrong by comparison.

Step 3's sync/async split is already how the code works and was left alone:
`Handle.getState()` is sync-from-cache on all three, while
`MusicControls.getState()` / `AudioControls.getState()` remain the async native
round-trip. `AudioHandle` is the one place that spans both, and
`useAudioPlayer` already resolves it to a cached snapshot rather than calling
through.

Step 4's `flush()` is on `VideoHandle` only. `MusicPlayer` and `Audio` have no
such need — their `Controls.getState()` is already the awaited native call.

---

### FG-1.4 — Music end-of-queue `onEnded` is emitted but never received

**Severity:** `DEAD-API` · **Effort:** S · **Platform:** JS

**Current behavior**
Android sends `onEnded` when the queue finishes with `repeatMode: 'off'`
(`ObsidianMusicPlayerModule.kt:153`); iOS does the same
(`ObsidianMusicPlayerModule.swift:125`). `MUSIC_EVENTS.ENDED` is defined
(`src/core/Events.ts:14`), but `useMusicPlayer` subscribes to only four events —
`STATE`, `PROGRESS`, `TRACK_CHANGE`, `QUEUE_CHANGE` (`useMusicPlayer.ts:73-78`).
The event is dropped on the floor, so an app cannot tell "queue finished" from
"paused".

**Implementation flow**
1. Add `MUSIC_EVENTS.ENDED` to the subscription array in `useMusicPlayer.ts:73-78` and to the `addListener` / `removeListeners` counts at `:80-89` (currently `4` — it must become `5` in all three places, including `removeListeners(4)` on cleanup).
2. Map it to a status transition: `setState(prev => ({ ...prev, status: 'ended' }))`, matching what `useAudioPlayer` already does at `useAudioPlayer.ts:39`.
3. Surface it through `MusicEventType` — `'ended'` is already in the union (`src/types.ts:79`).
4. Cross-check `MUSIC_EVENTS.ERROR` (`:15`) the same way: Android emits `onError` (`:68`) and iOS emits `onError` (`:237`), but neither is subscribed. Add both, so the counts become 7. `useAudioPlayer` already handles `ERROR` correctly (`:40`) — use it as the reference implementation.
5. Guard the `addListener`/`removeListeners` count arithmetic — this has already drifted once. Extract a single `const SUBSCRIBED = [...]` array and derive both the loop and the count from it.

**Verification**
- [x] `repeatMode: 'off'` at end of queue → `useMusicPlayer().state.status === 'ended'`
- [x] A player error surfaces `state.error` and does not throw
- [x] Native listener bookkeeping balances exactly, with no double-counting
- [x] 6 events subscribed, not 4 — asserted against the real `NativeEventEmitter`

**Outcome.** Implemented as a `subscriptions` array of `[name, handler]` tuples
used for the `addListener` loop, so the list of handled events and the handler
map cannot drift apart.

**Two corrections to the plan here.**

1. Step 1 and 4 were right that more events were missing, but wrong about the
   fix. Because the emitter is constructed *with* the native module,
   `NativeEventEmitter` already calls `nativeModule.addListener(name)` on
   subscribe and `nativeModule.removeListeners(1)` on unsubscribe
   (`node_modules/react-native/Libraries/EventEmitter/NativeEventEmitter.js:80,90`).
   The manual `MusicPlayerNative.addListener(...)` / `removeListeners(n)` calls
   were therefore **pure double-counting** and have been deleted outright rather
   than "derived". That became FG-1.6.
2. The count is 6, not 7. `MUSIC_EVENTS.REMOTE_COMMAND` is emitted by iOS
   (`ObsidianMusicPlayerModule.swift:186`) but is correctly owned by
   `useRemoteControls`, which surfaces it to the caller directly instead of
   folding it into playback state. Adding it here as well would double-handle
   lock-screen presses.

---

### ~~FG-1.5~~ — `VideoHandle` duplicated between native and web (DONE)

**Severity:** `DEAD-API` · **Effort:** XS · **Platform:** JS
**Not in the original audit — found while implementing FG-1.3.**

**Current behavior**
`src/components/Video.tsx` and `src/components/Video.web.tsx` each declared
their own `export interface VideoHandle`. They were byte-identical at the time
and then diverged: adding `flush()` to the native one for FG-1.3 would have left
the web copy without it, so `useVideoPlayer().controls.flush()` would type-check
and throw `flush is not a function` on web. `Audio.tsx` / `Audio.web.tsx` have
the same shape and the same latent risk.

**Implementation flow**
1. Move the `VideoHandle` definition into `src/types.ts`, which is already the
   shared cross-platform contract file.
2. `Video.tsx` and `Video.web.tsx` both import it and re-export it under the
   same name, so `import { type VideoHandle } from 'obsidian-media-player'`
   keeps working for consumers.
3. Implement `flush` in the web build too, matching the native semantics.

**Verification**
- [x] One definition, two consumers — a grep for `interface VideoHandle` returns only `src/types.ts`
- [x] Web build satisfies the same handle, including `flush`

**Not done here:** `AudioHandle` has the same duplication. Left for Wave 7 —
it is not currently divergent, only at risk.

---

### ~~FG-1.6~~ — Every hook double-counted native listener bookkeeping (DONE)

**Severity:** `DEAD-API` · **Effort:** XS · **Platform:** JS
**Not in the original audit — found while testing FG-1.4.**

**Current behavior**
`useMusicPlayer`, `useAudioPlayer` and `useRemoteControls` all did this:

```ts
const emitter = new NativeEventEmitter(MusicPlayerNative as any);
const sub = emitter.addListener(EVENT, handler);
MusicPlayerNative.addListener(EVENT);   // <-- redundant
return () => {
  sub.remove();                        // <-- already calls removeListeners(1)
  MusicPlayerNative.removeListeners(n);// <-- redundant
};
```

Passing the native module to the constructor is what makes `NativeEventEmitter`
manage the native listener count for you. Doing both meant the native side saw
**12 adds and 7 removes for 6 subscriptions** — measured, not inferred, by
recording every call in the test mock.

This is a real defect rather than cosmetic: the count is how TurboModules decide
whether to keep native resources alive, and an inflated count makes a module
hold its listeners open after the last JS subscriber has gone.

**Implementation flow**
1. Delete the manual `addListener` / `removeListeners` calls from all three hooks.
2. Keep the explicit `subscriptions` list (it is what makes the *event* set
   auditable) and add a comment pointing at `NativeEventEmitter.js:80,90`.

**Verification**
- [x] Mock records every `addListener` / `removeListeners` call
- [x] Adds == removes == number of subscriptions, each removal being `1`
- [x] Regression-pinned so the manual calls cannot come back

---

## Wave 2 — Web parity

### FG-2.1 — No `MusicPlayer` web build (breaks web bundling)

**Severity:** `CRASH` · **Effort:** M · **Platform:** WEB

**Current behavior**
Only `src/components/Video.web.tsx` and `src/components/Audio.web.tsx` exist.
There is no `MusicPlayer.web.tsx`. Metro / webpack resolve
`MusicPlayer.tsx` → `useMusicPlayer` → `src/native/MusicPlayerNative.ts:7` →
`TurboModuleRegistry.getEnforcing('ObsidianMusicPlayer')`, which **throws on
web**. Since `src/index.ts` re-exports `MusicPlayer` (`:7`), `MediaProvider`
(`:20`, which renders `<MusicPlayer>` at `MediaProvider.tsx:79`) and everything
downstream, **importing the package at all breaks any web target** — Expo web,
`react-native-web`, Next.js.

**What the audit got wrong**
The trace above names one break. There were **five**, and only the first is the
one described above. This is the same lesson as FG-0.5: a root cause found by
reading one import path is not the whole root cause.

| File | Break | Kind |
|---|---|---|
| `native/VideoNative.ts` | real (non-`type`) import of the spec → `react-native/Libraries/Utilities/codegenNativeComponent` | **bundle-time module resolution** |
| `native/MusicPlayerNative.ts:14` | `if (!ObsidianMusicPlayer) throw` at import | runtime, at import |
| `native/AudioNative.ts:16` | same import-time throw | runtime, at import |
| `hooks/useMusicPlayer.ts`, `useAudioPlayer.ts`, `useRemoteControls.ts` | `import { NativeEventEmitter } from 'react-native'` — react-native-web does not implement it | import |
| `native/CacheNative.ts:6` | no import-time throw, **but** its `require('../specs/…')` inside the New-Arch branch is followed **statically** by bundlers, so the spec was still in the web graph | **bundle-time** |

The last one is the instructive one. `CacheNative.ts` was *assumed* safe because
it takes the `NativeModules` path on web and yields `undefined`, which
`DownloadManager.hasNativeCache()` tolerates. That is true at runtime and
irrelevant to bundling: a `require()` inside a never-executed branch is still a
static edge. Only the new bundle gate caught it — see the regression note below.

**Implementation flow (as shipped)**
1. `src/native/notOnWeb.ts` — one shared error, so the wording cannot drift
   between stubs.
2. `src/native/{MusicPlayerNative,AudioNative,VideoNative}.web.ts` — import is
   safe, *calling* throws. The distinction is the whole point: the previous
   behaviour took down bundles for apps that never touched music. A `Proxy`
   answers every method, and `then` is explicitly masked so the stub is never
   mistaken for a thenable. `VideoNative.web.ts` renders `null` rather than
   throwing, because rendering it is a no-op while calling a command is a real
   mistake.
3. `src/native/CacheNative.web.ts` — exports `undefined` **on purpose**. A
   throwing stub would satisfy `hasNativeCache()` (the `Proxy`'s `get` returns a
   function for every key) and permanently disable the web `CacheStorage`
   fallback, which is the only offline cache a browser has.
4. `src/hooks/useMusicPlayer.web.ts` — a real player over one
   `HTMLAudioElement`, reusing `PlaylistManager` so queue semantics match native
   **by construction** rather than by parallel maintenance. `setShuffle` keeps the
   active track loaded across the toggle; unshuffling needs that done by hand
   because `buildOrder` ignores `preserveCurrent` when not shuffling.
5. `src/hooks/useAudioPlayer.web.ts` + `src/hooks/useRemoteControls.web.ts` —
   the former mirrors the native surface, the latter is a no-op (`mediaSession`
   is FG-2.3, deliberately not half-done here).
6. `src/components/MusicPlayer.web.tsx` — same props, same handle shape.
7. **Shared types.** `MusicControls`, `QueueSnapshot`, `AudioControls` and
   `MusicPlayerHandle` moved to `src/types.ts`; both platform files re-export
   them. The native hook's own copies are gone. Without this the web build would
   need its own duplicate of each, which is the FG-1.5 drift risk again.
8. `src/utils/webSrc.ts` — single point where a `MediaSource` becomes a URL, so
   FG-2.2 (headers) is a one-function change rather than an edit at every call
   site.
9. `npm run bundle:web` (`scripts/bundle-web.mjs` + `scripts/web-entry.ts`) and a
   CI job.

**Deviation: esbuild, not Metro.** Step 6 originally called for
`react-native bundle --platform web`. Metro dropped web support (the platform
flag is gone in current versions) and the repo has no root `metro.config.js`, so
that command would not have run. esbuild is used instead, with `resolveExtensions`
ordered `.web.*` first and `react-native` aliased to `react-native-web`. The
entry imports the *entire* public surface and parks it on a global: bundling
only the components an app happens to use would miss precisely the defect being
guarded, since the break is in what `index.ts` re-exports unconditionally.

**Three order-indexing bugs found while writing the tests**
`cursor` is a pointer into `order`, while `QueueSnapshot.index` is a *track*
index (`currentIndex` = `order[cursor]`). The first web draft conflated them:

- `skipTo` used the argument as a cursor, so under shuffle it played the wrong
  track.
- `addTracks` appended to `tracks` but not to `order`, making every new track
  permanently unreachable — and invisible, because the queue snapshot looked
  right.
- `removeTrack` filtered `tracks` but left `order` holding pre-deletion indices.
  With shuffle **off** this is self-cancelling (the cursor shift exactly cancels
  the index shift), so the first three tests I wrote for it **passed against the
  broken code**. It only shows up under a permutation or when the removed track
  was last. Both cases are now pinned, and `currentIndex → -1` for an empty
  queue is pinned in `PlaylistManager.test.ts` since the web player depends on
  that sentinel.

**Verification**
- [x] `import { MusicPlayer, MediaProvider } from 'obsidian-media-player'` bundles for web — `npm run bundle:web` OK, 50 KB, and a grep of the output confirms no `codegenNativeComponent`, `TurboModuleRegistry`, `NativeEventEmitter` or `__turboModuleProxy` survived
- [x] Web queue: shuffle, repeat, skip, seek, next/previous, auto-advance all tested — **33 tests**, all asserting exact values
- [x] `useMusicPlayer` web tests pass
- [x] **Regression-pinned:** with the 8 web files moved aside, `bundle:web`
      fails on `Could not resolve "react-native-web/Libraries/Utilities/codegenNativeComponent"`
- [x] **Each order-indexing bug re-introduced individually** and the suite
      fails for each (1–2 tests apiece), so none of the pins is vacuous
- [x] `npm run typecheck` / `lint` / `test` (94, 7 suites) / `bundle:web` all green

**Not verified:** the CI workflow has never run — there is no repository remote
CI yet, so `.github/workflows/ci.yml` is written but untested. Browser
behaviour is still unverified; the tests drive a fake `HTMLAudioElement`, which
proves the hook's logic and event wiring, not any specific browser's autoplay
policy or CORS enforcement.

**Known gap in the gate:** `bundle:web` bundles from `src/`, but a web consumer
resolves `lib/module/index.js` through the `exports` map — so the gate validates
the source graph, not the artifact that ships. The two were checked by hand
(`bob build` emits all 10 compiled `.web.js` files, and grepping them for real
import/require statements finds zero references to `../specs`,
`TurboModuleRegistry`, `NativeEventEmitter` or `react-native/Libraries`), and
the shared handles are all present in `lib/typescript/types.d.ts`. A second
esbuild pass over `lib/module` after `bob build` would close it properly; it
costs ~20 s per run, so it is deliberately not in the gate yet. Note that grepping
compiled output for `require` needs comment stripping — the JSDoc in these files
*describes* the very imports it avoids, and a naive grep reports them as leaks.

**Risk:** Step 1 alone converts a hard crash into a clear runtime error, which
buys time to do 2–3 properly. Ship step 1 as its own commit.

---

### FG-2.2 — Web: `MediaSource.headers` cannot be applied

**Severity:** `PARITY` · **Effort:** M · **Platform:** WEB

**Current behavior**
`Video.web.tsx` and `Audio.web.tsx` pass `uri` straight to the element's `src`.
The HTML media elements have no header API, so any source that needs an
`Authorization` header fails on web while working on both native platforms.

**Implementation flow**
1. Add a shared helper `src/utils/webFetch.ts`: when `source.headers` is
   non-empty, `fetch(uri, { headers })` → `response.blob()` →
   `URL.createObjectURL(blob)`.
2. Use it in both web components; keep the direct-`src` path when there are no
   headers, so the common case stays fast and CORS-free.
3. `revokeObjectURL` on source change and on unmount — a music queue churning
   through 50 tracks will leak every blob otherwise.
4. Fail loudly: a `fetch` failure must surface as a `PlaybackState` with
   `status: 'error'`, not a silent `<video>` that never fires `error`.
5. Document the CORS constraint — a cross-origin URL that does not send
   `Access-Control-Allow-Origin` cannot be fetched at all, so header-auth
   sources are unusable on web unless the CDN cooperates. This is a platform
   limit, not something we can fix.

**Verification**
- [x] A header-protected MP3 plays on web
- [x] `URL.createObjectURL` / `revokeObjectURL` counts balance after 50 track changes
- [x] A 404 produces `status: 'error'`

**Risk:** Whole-file buffering. A 200 MB video becomes a 200 MB in-memory
blob. Note it in the README; consider refusing the blob path above a size
threshold and falling back to the direct `src` with a warning.

**As shipped**
`src/utils/webFetch.ts` holds two things: `resolveWebSource(source)` (pure, and
the only place that knows the eligibility rules) and `WebSourceSlot`, which owns
the object URL and a generation counter. The temporary `utils/webSrc.ts` from
FG-2.1 was **deleted** — it was a placeholder for exactly this, and leaving both
would have meant two answers to "what URL does this source load".

All four web entry points (`Video.web`, `Audio.web`, `useMusicPlayer.web`,
`useAudioPlayer.web`) now resolve through the slot.

**Two things the plan did not call out**

1. **Segmented sources are refused, not buffered.** The plan's flow buffers
   whatever it fetches. For `type: 'hls' | 'dash'` that is wrong: a manifest is
   not the media, so there is no single blob to hand the element, and requesting
   it would truncate the stream and fail confusingly. Those sources now raise a
   `WebSourceError` naming the reason and suggesting a signed URL or a
   same-origin proxy. Only `progressive` / `file` / untyped are eligible.

   This also answers the plan's open question about a size threshold, and
   deliberately *not* by thresholding: falling back to a direct `src` for an
   oversized source means sending the request with no headers, which 401s. A
   clear refusal is a better failure than a silent one, and it needs no magic
   number to be wrong.

2. **Making the load asynchronous introduced a race that did not exist before.**
   `el.src = uri` was synchronous, so the last call always won. With a `fetch` in
   the middle, a slow fetch for track A can land *after* `skipTo(B)` and overwrite
   it. `WebSourceSlot` carries a generation counter and returns
   `{ kind: 'stale' }` for any resolution that is no longer newest, releasing the
   blob it made — nothing else knows that URL exists.

   The first version got the *success* race right and the *failure* race wrong: a
   superseded load that rejected returned `{ kind: 'error' }`, which would have
   put a playback error on screen for a track the user had already skipped past.
   Caught by the test that pins it.

**Found while implementing: FG-2.5.** `Audio.web.tsx` had **no media event
listeners at all**. It created the element, wired the imperative setters, and
nothing else — so `state.status` stayed `idle` for the life of the component and
the declared `onEvent` prop was never called once. It also built the element
mount-only from the initial `source`, so changing the `source` prop did nothing.
Step 4 above required somewhere to report a failed fetch, so this had to be
fixed in the same change; it is now tracked separately as **FG-2.5**.

**Test-infrastructure consequence.** Making `src` assignment asynchronous broke
14 existing web tests that asserted `el.src` straight after an `act()` call.
`renderHook` gained `actAsync`, which drains the microtask queue (four ticks —
one lands *between* the slot's `await` and the `src` assignment, which reads as
flakiness rather than as a real ordering). Every affected test is now `async`.
The lesson is the FG-1.3 one again: a test that asserts on a value the code now
produces asynchronously is testing the timing, not the behaviour, and the fix is
to await the real thing rather than to add a sleep.

**Verification performed**
- [x] 21 new tests in `__tests__/webFetch.test.ts` (no React needed — the
      resolver is pure): eligibility, 401 vs 404 wording, CORS message,
      missing `fetch` / missing `createObjectURL`, revoke idempotence, the
      50-track balance (`created` and `revoked` arrays compared for equality),
      and both race directions
- [x] 5 integration tests in the web music suite: blob URL reaches the element,
      404 → `status: 'error'`, HLS refused without a pointless fetch, per-skip
      revocation, unmount revocation
- [x] **Both mutations re-introduced and confirmed to fail**: assigning
      `track.source.uri` instead of the resolved URL (1 failure), and removing the
      unmount `release()` (1 failure)
- [x] Suite was 120 tests / 8 suites when this landed; `npm run verify` green and
      `npm run verify:android` still green (unaffected — these were JS-only changes)

**Not verified:** no browser has executed a header-auth fetch. The CORS and
autoplay behaviour these paths depend on can only be confirmed against a real
origin.

---

### FG-2.5 — `Audio.web.tsx` reports no playback state at all

**Severity:** `SILENT-WRONG` · **Effort:** S · **Platform:** WEB
**Not in the original audit — found while implementing FG-2.2.**

**Current behavior**
`Audio.web.tsx` before FG-2.2 created its `HTMLAudioElement` and attached no
listeners whatsoever. Consequences, all of them silent:

- `state.status` stayed `'idle'` forever. A consumer binding a spinner or a
  play/pause button to `getState().status` saw a player that never started.
- `position` and `duration` were never updated — only the imperative setters
  mutated state, so a progress bar bound to this stayed at 0.
- `onEvent`, a declared prop on `AudioProps`, was never called on web.
- The element was built mount-only from the initial `source`, so **changing the
  `source` prop did nothing at all** — no reload, no re-resolve.

**Implementation flow**
1. Attach `timeupdate`, `durationchange`, `loadedmetadata`, `play`, `pause`,
   `waiting`, `playing`, `ended` and `error`, publishing a merged
   `PlaybackState` through the same `stateRef` + `setState` pattern the other
   web components use.
2. Re-resolve the source whenever it changes by value (`uri` + `type` +
   `headers`), not just on mount.
3. Keep volume / rate / loop / paused as their own effects so prop updates apply
   after the element exists.

**Verification**
- [x] Events wired for all nine types; `status` reaches `playing` / `paused` /
      `buffering` / `ended` / `error`
- [x] `onEvent` fires
- [x] `source` change re-resolves

**Still open:** `AudioHandle` is duplicated between `Audio.tsx` and
`Audio.web.tsx`, and the two have **diverged** — the web copy declares
`load(s: { uri: string })` and an extra `getCurrentState`, neither of which is on
the native handle. That duplication is exactly the defect FG-1.5 fixed for
`VideoHandle`, and it is now causing real drift. Folded into the Wave 7
`AudioHandle` move rather than fixed separately, since that change is the fix.

---

### FG-2.3 — Web: no `navigator.mediaSession`

**Severity:** `PARITY` · **Effort:** M · **Platform:** WEB

**Current behavior**
iOS gets `MPRemoteCommandCenter` and Android is planned to get `MediaSession`
(FG-4.1). Web has nothing, so `useRemoteControls`
(`src/hooks/useRemoteControls.ts:23`) never fires in a browser — and it is
hardcoded to `MusicPlayerNative` (`:3`), so it cannot even reach the web queue.

**Implementation flow**
1. Generalise `useRemoteControls` to resolve its emitter the same way the other
   hooks do, so the web player can supply one. Add a `useRemoteControls.web.ts`
   that reads `navigator.mediaSession` `actionHandler`s.
2. Register `play`, `pause`, `previoustrack`, `nexttrack`, `seekbackward`,
   `seekforward`, `seekto` and `stop`.
3. Populate `navigator.mediaSession.metadata` (`title`, `artist`, `album`,
   `artwork`) from the active `Track` — this is where FG-6.4's `artwork` field
   finally becomes useful on a third platform.
4. Feature-detect: Safari and Firefox do not implement `navigator.mediaSession`
   fully. No-op cleanly, and do not throw in SSR (guard `typeof window`).
5. Make `useRemoteControls` a no-op rather than an error on platforms with no
   remote surface at all.

**Verification**
- [x] Chrome: lock-screen / keyboard-media-key controls drive the web queue — the `MediaSessionAction` → `RemoteCommand` mapping is asserted action by action
- [x] Firefox and Safari degrade without throwing — an unsupported action is skipped, the other seven still register
- [x] SSR render does not touch `navigator` — every entry point is asserted against a missing `navigator` and a `mediaSession: undefined`
- [x] 20 tests in `webSession.test.ts` + 16 in `useRemoteControls.web.test.tsx`

**Risk:** Low. Purely additive, feature-detected.

**As shipped**
`src/utils/webSession.ts` is the only module that touches `navigator.mediaSession`,
because it is a **document singleton** — `setActionHandler` overwrites whatever
was there, so two modules writing handlers would silently clobber each other
last-write-wins with no error. `useRemoteControls.web` owns the handlers; the web
music player owns metadata and position state, and clears only metadata on unmount
rather than calling `clearWebSession()`, which would take the handlers down with it.

**Deviation from step 1: the emitter was never needed.** The plan proposed
generalising `useRemoteControls` to resolve its emitter so the web player could
supply one. The web path has no emitter to resolve — `MediaSessionAction` handlers
are called by the browser directly. The hook only needs to *emit* `RemoteCommand`
values upward, which is what `onCommand` already did. So step 1's first half is
unnecessary and was dropped.

**The three seek actions collapse into one command.** `seekbackward` and
`seekforward` send a *delta*; the native platforms send an absolute `position`. So
the hook adds `getState` as a second parameter to resolve them. It is optional and
documented, because a consumer that never seeks can ignore it — but without it
those two commands would seek to `position: 0`, which is why the tests pin the
resolution rather than just the command name.

**Two pins were vacuous on the first attempt.** Both are the same failure mode as
FG-1.3, and both were found only by re-introducing the bug and watching the suite
stay green:

1. *"skips a non-finite or zero duration"* asserted only that the call did not
   throw. The `try`/`catch` around `setPositionState` swallows the browser's
   `TypeError`, so deleting the guard entirely still passed. The real contract is
   *do not call it at all* — which also matters on an engine that accepts the
   value rather than rejecting it. Now asserted with a call count, plus a
   companion test proving the count is non-zero for a valid input so the
   assertion cannot be satisfied for an unrelated reason.
2. *"does not re-register when the callback identity changes"* re-rendered with a
   **stable** callback, so it passed even with the effect's dep array changed from
   `[]` to `[onCommand, getState]`. It now re-renders with a fresh inline closure,
   which is the realistic case and the whole reason the ref indirection exists.

The general rule, now written into the regression-verification section: a test
that passes against deliberately broken code is worse than no test, because it
reports coverage for a behaviour nothing is checking.

**Mutations confirmed to fail**
- `applyWebSessionPositionState`: no clamp (2 failures), no duration guard (1)
- `applyWebSessionHandlers`: unsupported action aborts the batch (1), disposer
  clears actions it did not set (1)
- `useRemoteControls.web`: raw offset passed through as a position (4), malformed
  `seekto` accepted (1), dep array depending on the callback (1)

**Not verified:** no browser has been driven. There is no Chrome, no OS media
session, and no lock screen in this environment, so "the keyboard media keys
control the queue" is asserted at the handler boundary and nowhere further. The
`MediaMetadata` constructor call, the `artwork` rendering and the OS-level
presentation are all unexercised.

---

### FG-2.4 — Web: real offline download

**Severity:** `PARITY` · **Effort:** M · **Platform:** WEB
*(extends README roadmap row 7, `README.md:374`)*

**Current behavior**
`DownloadManager.download` (`src/core/DownloadManager.ts:29-34`) opens
`caches.open('obsidian-media')` and calls `cache.add(uri)`, wrapped in an empty
`catch {}`. `removeDownload` does nothing at all (`:42-43`, comment admits
"best-effort eviction not tracked per-id"). `getDownloads` returns `[]`.

**Implementation flow**
1. Use `cache.put()` with an explicit `Response` rather than `cache.add()`, so
   the stored entry can be keyed by download `id` and later looked up.
2. Store a small metadata record alongside each entry (uri, content-type,
   `storedAt`, byte length via `blob().size`).
3. Implement `removeDownload` as `cache.delete(request)` against that key.
4. Add a `getDownloads` implementation that enumerates the cache and rebuilds
   `DownloadInfo[]`.
5. Surface the same CORS warning as FG-2.2 — `caches` is subject to it.
6. Report `DownloadManager` capability rather than assuming: add a
   `DownloadManager.isSupported` flag so callers can hide the UI instead of
   clicking into a no-op.

**Verification**
- [x] Download → `getDownloads` → `removeDownload` round-trips on web
- [x] `clearCache` empties the store
- [x] A CORS-blocked source produces a visible error, not a silent success
- [x] 29 tests in `__tests__/webDownloadCache.test.ts`

**Risk:** The empty `catch {}` at `:33` currently hides every failure. Remove
it - silent download failure is worse than a thrown one.

**As shipped**
`src/core/webDownloadCache.ts` holds the CacheStorage implementation, extracted for
the same reason `webFetch.ts` / `webSession.ts` exist: a platform-specific
implementation behind a shared interface, testable without React Native's
`Platform` or a native mock. `DownloadManager` is now a thin delegator.

**The key detail the plan left implicit: CacheStorage has no notion of an id.**
`cache.add(uri)` keys by *media URL*, so the same file could not be downloaded
twice under two ids, and `removeDownload(id)` had nothing to delete — which is why
it was a comment saying so. Entries are now `put` under a synthetic key:

```
https://obsidian-media-player.invalid/download/<encodeURIComponent(id)>
```

`.invalid` is reserved by RFC 2606 and can never resolve, so the key can never
collide with a real request; it is never fetched, it only names an entry. That is
what makes lookup, deletion and enumeration work from the id alone, across page
reloads, matching what `SimpleCache` / `AVAssetDownloadTask` already give you.

**The fetch is manual rather than `cache.add()`.** That is also what lets this
honour `MediaSource.headers`, which the old one-liner could not — so a
header-authenticated download now works on web for the same reason playback does
(FG-2.2).

**Two deviations from the plan, both corrections**

1. **The HLS refusal is unconditional, not header-gated.** FG-2.2's playback path
   gates the segmented-stream refusal on `headers` being present, because
   *playing* a manifest without headers works fine — the element fetches the
   segments itself. *Storing* it does not, with or without headers: a cache entry
   holds one body, and a segmented stream is a manifest plus many. Downloading the
   manifest alone would save something that cannot be played back later, which is
   a silent useless download — worse than refusing. `dash` is included too.
2. **Failures reject instead of being swallowed.** The `catch {}` is gone, as the
   plan's Risk note required. A CORS block, a 401/403 and a 404 each get their own
   message. `download()`'s return type widened from `Promise<void>` to
   `Promise<DownloadInfo>` — backward compatible for callers, and it means a caller
   can read the stored byte count without a second `getDownloads()` round trip.
   `getCacheSize()` is implemented too, summed from a recorded size so it does not
   pull every blob through memory.

**`DownloadInfo` moved to `src/types.ts`,** and `src/index.ts` stopped
re-exporting it from `core/DownloadManager` — `export * from './types'` already
covers it, and two export statements for one name is the drift FG-1.5 removed
elsewhere. `DownloadManager.isSupported` is a **getter**, not a constant, so it
reflects the environment at the moment it is read: `caches` is absent outside a
secure context, and a test that installs a double has to see that.

**Two real bugs the tests found, both mine**

1. **A non-Latin-1 id or uri made every download fail.** I had put the raw id and
   uri into custom `Response` headers. HTTP header values must be ByteStrings, so
   `new Response` *throws* on an em dash, a CJK character or an emoji — turning a
   track title into a failed download. The id is not stored in a header at all
   (it is recovered from the cache key, which is the design); the uri is
   percent-encoded on write and decoded on read.
2. **A cache key with a malformed percent escape took out the whole listing.**
   `idFromKey` used a bare `decodeURIComponent`, which throws on `"100%"`. One
   undecodable key would have made `getDownloads()` reject, and a download list
   that renders as empty because of one bad row is indistinguishable from "nothing
   is downloaded". Every read now goes through `safeDecode`.

**Two vacuous pins, again**
- *"encodes ids that contain url-unsafe characters"* used `a/b?c#d`, which
  `decodeURIComponent` passes through unchanged, so it passed with the encoding
  removed. The load-bearing id is `100%` (throws) — now pinned, along with a
  non-ASCII id.
- *"does not throw on a key it cannot decode"* did not exist; the safe-decode guard
  had no test at all, and the mutation confirmed it. Now a corrupt key is planted
  directly in the store.

**A note on the test double:** the first version returned `{ size, type }` where a
`Blob` was required. `new Response(plainObject)` is invalid BodyInit, and undici
did something pathological with it — the suite took **129 s**. With a real `Blob`
it runs in ~1.5 s. A slow test is usually a wrong test.

**Mutations confirmed to fail** (7 of 7): key by media url (10 failures), swallowed
fetch failure, dropped segmented-stream refusal, unencoded id in the key, ignored
response status, raw uri in a header, throwing `decodeURIComponent`.

**Not verified:** no browser. CacheStorage is emulated by a Map-backed double, so
real quota behaviour, real eviction under storage pressure, and whether a real
engine accepts a synthetic `.invalid` key are all unexercised. The last one is the
biggest open question here: the scheme is never fetched, but that assumption has
not been tested against an actual implementation.

---

## Wave 3 — iOS architecture correctness

**This wave is done. The headline is that step 1 — "verify first" — was the only
part of the plan that survived contact with the code.** The rest was built on a
guess about the failure, and the guess was wrong in a way that pointed at a
non-problem while three real ones sat next to it.

**What verification actually found**, by running RN codegen (a pure Node
function, so it runs here on any platform) and reading RN 0.74's own sources in
`node_modules` rather than reasoning from memory:

| Question the plan asked | Answer |
|---|---|
| Do the modules need `RCT_EXPORT_MODULE`? | **No.** `RCTTurboModuleManager` falls through to `NSClassFromString(moduleName)`, and `@objc(ObsidianAudio)` already matches the JS module name. Registration is not merely unnecessary, it would be **dead code** — the `RCTGetModuleClasses()` scan it feeds runs *after* the class-name lookup. The plan's risk note was right, and step 3 (add `RCT_EXTERN_MODULE` shims for the modules) would have added three files that do nothing. |
| Then why doesn't it work? | **The protocol name is wrong.** Codegen emits `@protocol NativeObsidianAudioSpec`. The Swift files declared `extension ObsidianAudio: ObsidianAudioSpec {}`. No such protocol exists. Hard compile error. |
| Could that conformance live in Swift? | **No.** `RCTTurboModule` requires `getTurboModule:` returning a C++ `std::shared_ptr` — unimplementable from Swift. It has to be an ObjC++ category, which is what RN's own modules do. |
| Does `#if RCT_NEW_ARCH_ENABLED` guard it in Swift? | **It is a no-op.** That is a *C preprocessor* macro, and Swift's `#if` tests Swift compilation conditions. The block was always compiled out — a guard that reads like protection and provides none. |
| Does the bridging header work? | **No.** It imported the generated spec header, which opens with `#ifndef __cplusplus / #error`. A bridging header is parsed as Objective-C, so that import fails the build. |
| Is the podspec sound? | **No.** It declared `ReactCodegen`; the pod is `React-Codegen`. `pod install` fails outright. |
| Does `<ObsidianVideo>` work under Fabric? | **Not previously.** It is a Paper `RCTViewManager`, so it depends on the interop layer — and the interop layer has a hardcoded component allowlist that `ObsidianVideo` was not on, plus eight commands with no `RCT_EXPORT_METHOD` to dispatch them. |

So the plan's `CRASH` was real but misattributed. The actual severity was
**higher**: not "the module is unregistered at runtime" but **"the pod cannot
compile at all"**, and `<ObsidianVideo>` could not have rendered.

**The new gate is `npm run verify:ios`** (`scripts/verify-ios-codegen.mjs`). It
runs codegen for real and cross-checks the generated output against the native
sources: protocol names, spec-method coverage, the interop allowlist, the video
command exports, the podspec dependencies, and the bridging header. It is
platform-independent, takes about a second, and is wired into `npm run verify`
and both CI jobs. Each rule is derived from the generated files at runtime, so
renaming a spec in `src/specs` cannot quietly invalidate it.

**What it still cannot do:** compile Swift, link, or run on a device. It is a
cross-check, not a build. `pod lib lint` (FG-0.6) and a real device remain
unproven, and no claim below should be read as "verified on hardware".

---

### FG-3.1 — iOS modules never call `RCT_EXPORT_MODULE`

**Severity:** `CRASH` → `BUILD` · **Effort:** M · **Platform:** IOS
*(scope depends on D1 — resolved as D1(a), drop Paper)*

**Original finding**
`ObsidianAudio` (`ios/Audio/ObsidianAudioModule.swift:6`),
`ObsidianMusicPlayer` (`ios/Music/ObsidianMusicPlayerModule.swift:5-6`) and
`ObsidianCache` (`ios/Cache/ObsidianCacheModule.swift:8-9`) are annotated
`@objc(ObsidianAudio)` etc. That **names** the Objective-C class; it does not
register the module with the React Native bridge. A repo-wide grep for
`RCT_EXPORT_MODULE`, `RCT_EXTERN_MODULE` and `modulesProvider` returns zero
matches. `ObsidianVideoManager` (`ios/Video/ObsidianVideoManager.swift:4-5`) is
the same.

**Correction, from verification**

The observation is accurate and the conclusion drawn from it was not. Three
things were conflated:

1. **Module registration is a non-problem on iOS.** `RCTTurboModuleManager`
   resolves a module by class name when no provider claims it, and the `@objc`
   names already match. So `NativeModules.ObsidianAudio` being `undefined` is
   *not* a consequence of the missing macro under the New Architecture, and
   adding `RCT_EXTERN_MODULE` would not have fixed it.
2. **The conformance to the generated protocol was simply invalid.**
   `extension ObsidianAudio: ObsidianAudioSpec {}` names a protocol that codegen
   never emits. Under `RCT_NEW_ARCH_ENABLED=1` this is a compile error, so the
   claim that the Old Architecture "definitely" broke and the New Architecture
   "may work" had it backwards: *neither* worked, because the New Architecture
   path is the one that compiles the codegen output.
3. **`#if RCT_NEW_ARCH_ENABLED` in Swift is not a guard.** Swift's `#if` does not
   see C macros, so the conformance block was always compiled out. This is why
   the bug survived being read: the code *looks* conditional.

**Also found, not in the original item**

- The bridging header imported the Objective-C++-only generated spec.
- The podspec named `ReactCodegen` instead of `React-Codegen` — `pod install`
  could not succeed.
- `ObsidianCache` declared empty `addListener`/`removeListeners` to satisfy a
  spec that asks for them, while extending `NSObject` rather than
  `RCTEventEmitter`. Codegen emitted both sides faithfully, so a module that
  never emits an event advertised that it did.
- `+moduleName` is a **required** `RCTBridgeModule` method, and
  `RCTBridgeModuleNameForClass` calls `[cls moduleName]` unconditionally.
  `RCT_EXPORT_MODULE` normally supplies it; with no macro and no manual
  implementation, module lookup is an unrecognised selector, not a `nil` return.

**As shipped**

- `ios/ObsidianMediaPlayerModules.mm` (new): ObjC++ categories conforming
  `ObsidianAudio` / `ObsidianMusicPlayer` / `ObsidianCache` to
  `NativeObsidianAudioSpec` / `NativeObsidianCacheSpec` /
  `NativeObsidianMusicPlayerSpec`, each supplying `+moduleName` and
  `getTurboModule:`. Conformances moved out of Swift entirely, since Swift
  cannot express the protocol.
- `src/native/requireTurboModule.ts` (new): one resolver for all three, using
  `TurboModuleRegistry.get` (which covers Android's `BaseReactPackage` path and
  iOS's TurboModule proxy) and throwing an error that names
  `RCT_NEW_ARCH_ENABLED=1`. The old per-module `NativeModules` fallback is
  deleted — under D1(a) it is a path that cannot work, and it is exactly what
  turned a missing module into a silent `undefined`.
- `NativeObsidianCache.ts` + `ObsidianCacheModule.swift`: the phantom
  `addListener`/`removeListeners` removed from both sides. Spec and class now
  agree.
- `ios/ObsidianMediaPlayer.podspec`: raises unless `RCT_NEW_ARCH_ENABLED=1`, so
  a misconfigured app fails at `pod install` with an actionable message instead
  of at runtime.
- `npm run verify:ios` gates all of the above; `__tests__/architecture.test.ts`
  covers the JS half.

**Verification**
- [x] Generated protocol names match the ObjC++ conformances (`verify:ios`)
- [x] Every method each generated protocol requires exists in the corresponding
      Swift class — 9 / 5 / 16 methods
- [x] `+moduleName` present for all three
- [x] `requireTurboModule` throws a message naming `RCT_NEW_ARCH_ENABLED=1`
- [x] No Swift file carries a spec conformance or a `#if RCT_NEW_ARCH_ENABLED`
- [ ] `TurboModuleRegistry.getEnforcing` succeeds on a real device
- [ ] Old Architecture: removed by decision, not fixed

**Mutations confirmed to fail** (12 of 12 against the pre-fix tree): misspelled
protocol, missing conformance, missing `getTurboModule:`, missing `+moduleName`,
allowlist opt-in removed, one `RCT_EXTERN_METHOD` deleted, `addListener`
re-added to the cache spec, `ReactCodegen` restored, `React-RCTAppDelegate`
restored, bridging header spec import restored, `SWIFT_OBJC_BRIDGING_HEADER`
removed, `NativeModules` fallback restored.

**Not verified:** no Swift compilation, no linking, no device. The gate proves
the generated contracts line up with the native sources; it cannot prove the
code compiles. `pod lib lint` is still unproven.

---

### FG-3.2 — Podspec declares app-target pods as library deps

**Severity:** `BUILD` · **Effort:** S · **Platform:** BUILD

**Current behavior**
`ios/ObsidianMediaPlayer.podspec:25-28`, under `RCT_NEW_ARCH_ENABLED=1`:

```ruby
s.dependency "ReactCodegen"
s.dependency "RCT-Folly"
s.dependency "React-RCTAppDelegate"
```

`RCT-Folly` is a vendored pod that must be sourced consistently with the app;
declaring it from a library risks a duplicate or mismatched copy.
`React-RCTAppDelegate` belongs to the **app** target — a library depending on it
is backwards. Standard RN libraries declare only `ReactCodegen`.

**Implementation flow**
1. Drop `RCT-Folly` and `React-RCTAppDelegate`; keep `ReactCodegen`, which is
   what provides the `ObsidianMediaPlayerSpec` protocols the Swift files conform
   to at `ObsidianAudioModule.swift:79-80` and `ObsidianMusicPlayerModule.swift:254-256`.
2. Keep `s.compiler_flags = "-DRCT_NEW_ARCH_ENABLED=1"` (`:28`) — that is the
   flag the `#if RCT_NEW_ARCH_ENABLED` blocks test.
3. Revisit the `pod_target_xcconfig` at `:29-32`. It sets
   `HEADER_SEARCH_PATHS` to `"$(PODS_ROOT)/boost"`, which is Folly's layout — it
   becomes unnecessary once the Folly dependency is gone.
4. Verify the bridging header is actually wired. `ObsidianMediaPlayer-Bridging-Header.h`
   is the only place the Swift files get `RCTEventEmitter` / `RCTViewManager`
   (they use no `import React`). The podspec never sets
   `SWIFT_OBJC_BRIDGING_HEADER`; it works only because the filename matches
   Xcode's `<Target>-Bridging-Header.h` convention for a pod target named
   `ObsidianMediaPlayer`. Set it **explicitly** so a rename cannot break it.
5. Re-check the deployment target (README roadmap row 8, `README.md:375`):
   `s.platforms = { :ios => "13.0" }` (`:14`) versus `minSdk 24` on Android. The
   `AVAssetDownloadURLSession` path at `ObsidianCacheModule.swift:84` guards on
   `#available(iOS 10.0, *)`, which is always true at a 13.0 floor — that guard
   is dead and can be deleted.

**Verification**
- [ ] `pod install` succeeds with no `React-RCTAppDelegate` in the library's dependency graph
- [ ] `pod lib lint --allow-warnings` passes
- [ ] A clean `expo prebuild --clean && pod install` produces no duplicate-symbol errors

**Risk:** Medium. Folly and AppDelegate are deeply wired into new-arch apps;
removing the declarations can surface latent assumptions in this podspec. Build
against a real app, not in isolation.

**As shipped, plus two things the plan missed**

Every step was correct. Two additions:

6. **`ReactCodegen` does not exist.** The pod is **`React-Codegen`**
   (hyphenated), and it is generated into the app's build directory rather than
   shipped in `node_modules`. The old spelling made *every* `pod install` fail
   with `Unable to find a specification for ReactCodegen` — so this item was
   not a latent risk, it was a hard blocker that the plan read as cosmetic.
7. **`React-RCTFabric` is a new dependency, not a removed one.** It provides
   `RCTLegacyViewManagerInteropComponentView`, whose header the interop
   allowlist opt-in in FG-3.3 needs. It is only installed when the New
   Architecture is on, which is now mandatory (D1), so that is consistent.

Also, the plan's step 2 rationale is now wrong in a way worth recording: it
kept `-DRCT_NEW_ARCH_ENABLED=1` because "that is the flag the `#if
RCT_NEW_ARCH_ENABLED` blocks test". Those blocks are **all deleted** — the Swift
ones were no-ops that never ran (see FG-3.1), and the remaining ones are in
ObjC/C where the macro works. The flag is still required, now for the podspec
guard and the `.mm` file.

**Verification**
- [x] `React-Codegen` declared; `ReactCodegen` gone
- [x] `RCT-Folly` and `React-RCTAppDelegate` removed; `React-RCTFabric` added
- [x] boost `HEADER_SEARCH_PATHS` removed with the Folly dependency
- [x] `SWIFT_OBJC_BRIDGING_HEADER` set explicitly
- [x] `pod install` fails with an actionable message when
      `RCT_NEW_ARCH_ENABLED` is unset
- [x] Dead `#available(iOS 10.0, *)` guard deleted
- [ ] `pod install` succeeds (needs macOS)
- [ ] `pod lib lint --allow-warnings` passes (needs macOS; FG-0.6)
- [ ] A clean `expo prebuild --clean && pod install` produces no
      duplicate-symbol errors

**Not verified:** no `pod install` and no `pod lib lint` — both need macOS, and
FG-0.6 records that neither has ever run. The gate checks the podspec's *text*
(declared dependencies, the architecture guard, the bridging header setting),
which is not the same as a resolved dependency graph.

---

### FG-3.3 — No Fabric component view for video

**Severity:** `PARITY` · **Effort:** L · **Platform:** IOS
*(closed as accepted per D1(a) — see below)*

**Outcome: accepted, interop-only. But "interop works" was itself a finding, not
an assumption.** The plan's step 1 said "only if D1(b)", and D1(a) means interop
it is. What the plan did not check is whether the interop path was actually
wired, and it was not — in three independent places. All three are fixed; the
decision to *keep* interop rather than write a Fabric component view is
unchanged.

**What the interop layer actually requires**, read from RN 0.74's sources:

1. **The component must be on a hardcoded allowlist.**
   `RCTComponentViewFactory.registerComponentIfPossible:` only falls through to
   the Paper interop layer when `RCTLegacyViewManagerInteropComponentView
   isSupported:` returns YES, and that method checks a list hardcoded in RN
   itself (`DatePicker`, `ProgressView`, `SegmentedControl`, `MaskedView`,
   `ARTSurfaceView`, …). `ObsidianVideo` is not on it, so the component resolved
   to `RCTUnimplementedViewComponentView`: **no exception, no log line, just
   empty space.** Fixed with a `+load` calling
   `supportLegacyViewManagerWithName:@"ObsidianVideo"`
   (`ios/ObsidianMediaPlayerModules.mm:155`) — `+load` because it has to run
   before the first component is registered.
2. **Every command needs an `RCT_EXPORT_METHOD`.** The interop coordinator
   resolves commands by scanning the view manager's metaclass for selectors
   prefixed `__rct_export__`, which is what that macro emits. The eight Swift
   `@objc` methods in `ObsidianVideoManager` produced no such metadata, so all
   eight `VideoHandle` commands would have logged
   `No command found with name "play"` and done nothing. Fixed with
   `RCT_EXTERN_METHOD` in the new `.mm` file (`:132-139`).
3. **The view manager must be in the bridge's module registry**, which
   `RCT_EXTERN_MODULE` provides (`:130`). Unlike the TurboModules, the interop
   layer does *not* have a class-name fallback for this.

**Why not write the Fabric component view anyway.** Steps 3–7 of the plan are
still a day of unverifiable work on this host: it is the highest-risk item in the
document, it duplicates prop plumbing that `ObsidianVideoPlayer` already
implements, and it cannot be compiled or run here to prove it works. Writing 100
lines of untested Fabric against a read-only understanding of the generated
descriptors would trade a *known* working path for an *unverified* one. The
honest position is that interop is now correct and Fabric is a real improvement
someone can do with a Mac.

**Verification**
- [x] `ObsidianVideo` is opted into the interop allowlist — present at
      `ObsidianMediaPlayerModules.mm:155`
- [x] All eight commands have `RCT_EXTERN_METHOD` declarations, and
      `supportedCommands` matches the generated command set exactly
      (`verify:ios` rules `video:commands` and `video:command-drift`)
- [ ] `RCT_NEW_ARCH_ENABLED=1` with interop **disabled** renders video — needs macOS
- [ ] Each of the eight commands drives the player on a device — needs a device

**Not verified:** every box above is a *static* check. Nothing here has been
compiled or run: the `.mm` file is never built on this host, so a wrong selector
signature or a missing import would pass the gate and fail the first real
`pod install`. `verify:ios` derives its rule names from the generated files at
runtime, so a rename in `src/specs` cannot silently invalidate the gate — but that
only proves the *declaration* is present, not that it links.

---

## Wave 4 — Android media session

FG-4.1 is the reason `useRemoteControls` is currently iOS-only. It is large but
well-understood, and it is the single biggest perceived-capability gap.

**Read FG-4.0 first.** It is not on the original audit's list and it changes the
shape of FG-4.1: today the `MediaSession` is built from a player the *module*
owns, so there is no session for a service-owned notification to attach to.

### FG-4.0 — The foreground service owns no player

**Severity:** `SILENT-WRONG` · **Effort:** L · **Platform:** AND
*(not in the original audit — found while reviewing the Android media-session work)*

**Current behavior**
`ObsidianPlaybackService` is a bare `Service` (`ObsidianPlaybackService.kt:12`):
`onBind` returns `null` (`:13`), `onCreate` only makes a notification channel, and
`onStartCommand` builds a static `NotificationCompat` and calls `startForeground`.
It holds no `ExoPlayer`, no `MediaSession`, no `MediaController`, no queue, no
position. It cannot be told what changed, and it cannot be asked to stop.

Meanwhile the actual player is created by the React module —
`ExoPlayerProvider.buildPlayer(ctx)` in a `by lazy` block at
`ObsidianMusicPlayerModule.kt:27` — and the `MediaSession` is built from *that*
player at `:135`. The service and the session live in different objects with no
reference between them.

Consequences, all of them user-visible:

- **A JS reload stops playback.** `invalidate()` (`:195`) releases the player and
  the session. Fast Refresh, a code push, or any bridge teardown kills the audio.
- **Process death loses everything.** `START_STICKY` restarts the service, which
  re-posts the *same* notification with the title/artist captured in the original
  intent extras (`:176-178`) and no player behind it. The user sees a
  "playing" notification for a track that is silent.
- **Track changes never reach the notification.** The extras are set once, in
  `setBackgroundEnabled` (`:172-184`), and never updated.
- **No external surface can reach the player.** `onBind` → `null` means
  `MediaButtonReceiver`, Wear OS, Android Auto and `MediaController` have nothing
  to connect to — which is why FG-4.1's step 4 has nothing to build on.
- **No audio attributes are ever set.** `buildPlayer` is a bare
  `ExoPlayer.Builder(context).build()` (`ExoPlayerProvider.kt:78-79`) with no
  `AudioAttributes`, so there is no focus request, no ducking and no
  `becomingNoisy` handling anywhere in the package. The blueprint for §4/§5/§8/§9
  of Appendix A all sit on top of this.

**Implementation flow**
1. Make the service a `MediaSessionService`. Move `ExoPlayer` construction into
   it and implement `onGetSession`; the `MediaSession` is then owned by the
   service, which is the only process component guaranteed to outlive a JS reload.
2. Publish the queue and playback state through the session
   (`MediaSession.Callback`, `MediaItem` queue, `setMediaMetadata`) rather than
   through ad-hoc intent extras. Delete the extras.
3. Have the module obtain a `MediaController` (or bind) instead of owning a
   player. The controller is a thin proxy — `setMediaItems`, `seekTo`,
   `setPlaybackParameters` — and it is also what makes the session reachable by
   system surfaces for free.
4. Set `AudioAttributes` with `handleAudioFocus = true` (or an explicit
   `AudioFocusRequest` with the policy from FG-8.1) on the service's player, and
   surface `onAudioFocusChange` / `onPlaybackStateChanged` to JS as events. Do this
   here rather than separately — focus handling needs somewhere to live, and this
   is that place.
5. Wire the notification to the session's metadata and state
   (`MediaMetadata.retrieveBitmap` for artwork — pair with FG-6.4). FG-4.1 then
   becomes "add `MediaStyle` and actions to a notification that is already
   correct", which is a much smaller change than it looks today.
6. Route JS commands through the controller so a lock-screen press and an
   in-app `play()` cannot diverge — the same requirement FG-4.1 step 2 states.

**Verification**
- [ ] A Fast Refresh during playback does not stop the audio
- [ ] `adb shell am force-stop` then relaunching recovers the track and position
- [ ] The notification title/artist follow track changes
- [ ] `MediaController` connects successfully from a second process/context
- [ ] Focus loss pauses (or ducks, per policy) and focus gain restores

**Risk:** Highest-risk item in Wave 4, and it is a rewrite of the Android music
module's ownership model. Sequence it as its own PR, keep the module's public
surface identical, and do not start FG-4.1 until it is stable. It also requires a
real device — foreground-service behaviour cannot be validated on a web CI
runner, and `MediaSessionService` is the most version-sensitive API in this
module.

---

### FG-4.1 — Android lock-screen controls are inert

**Severity:** `PARITY` · **Effort:** L · **Platform:** AND

**Current behavior**
- `setRemoteControls(optionsJson)` is literally
  `= ensureMediaSession()` (`ObsidianMusicPlayerModule.kt:173`) — the argument
  is discarded, so `enablePlayPause` / `enableSkip` / `enableSeek`
  (`src/types.ts:100-109`) are ignored on Android.
- The `MediaSession` is built with no `setCallback`, so hardware buttons and
  `MediaButtonReceiver` do nothing (`:137`).
- The foreground-service notification is a plain `NotificationCompat.Builder`
  with a title, text and `ic_media_play` — **no `MediaStyle`, no actions**
  (`ObsidianPlaybackService.kt:24-29`). The lock screen therefore shows a static
  notification that cannot be controlled.
- `useRemoteControls` (`src/hooks/useRemoteControls.ts`) subscribes only to
  `MUSIC_EVENTS.REMOTE_COMMAND` and calls
  `MusicPlayerNative.addListener` — Android's module does have
  `@ReactMethod addListener`, but nothing ever emits `onRemoteCommand`.

**Implementation flow**
1. Give `MediaSession.Builder` a `setCallback(MediaSession.Callback)` that
   handles `onPlay`, `onPause`, `onSkipToNext`, `onSkipToPrevious`,
   `onSeekTo`, `onStop`, `onSetPlaybackState` and `onSetRepeatMode`
   (`:136-138`). Each must route through the same `next()` / `previous()` /
   `seek()` methods JS already calls, so lock-screen and in-app behaviour cannot
   diverge.
2. Inside each callback, emit the equivalent `MUSIC_EVENTS.REMOTE_COMMAND` event
   to JS via `send(...)` (`:74-76`) with
   `{ command, payload: { position } }` for seek — matching what iOS sends at
   `ObsidianMusicPlayerModule.swift:186` and what `useRemoteControls.ts:24-26`
   already expects. This makes `useRemoteControls` work on Android with **zero
   JS changes**, which is the whole point.
3. Rebuild the notification with `NotificationCompat.MediaStyle()`:
   `.setMediaSession(sessionCompatToken)`,
   `setSmallIcon(R.drawable.ic_media_play)`,
   and `addAction` for prev / play-pause / next, with the play-pause icon
   swapping on `Player.Listener.onIsPlayingChanged` (`:63-66`).
4. Give `ObsidianPlaybackService` a real lifecycle: hold the `MediaSession` and
   a `MediaController`, and use `MediaButtonReceiver` so headset and
   Wear OS buttons route in. `onBind` currently returns `null` (`:13`) and
   `onDestroy` does not release anything.
5. Implement `setRemoteControls(optionsJson)` honestly: parse the JSON and
   enable only the requested command handlers, mirroring the iOS behaviour at
   `ObsidianRemoteControls.swift:16-28`. Returning success while ignoring the
   argument is the actual bug.
6. Call `notifyMediaSession()` on every state change so the lock screen stays in
   sync — and only while `setBackgroundEnabled(true)`.
7. Handle the Android 13+ `POST_NOTIFICATIONS` runtime permission: the service
   runs regardless, but the notification is invisible without it, which looks
   identical to "background playback is broken". Document in `README.md:46-50`.

**Verification**
- [ ] Lock screen shows a `MediaStyle` notification with working prev/play-pause/next
- [ ] `useRemoteControls` fires on Android for every command in
      `RemoteCommand` (`src/types.ts:7-12`)
- [ ] `enableSkip: false` genuinely removes skip from the lock screen
- [ ] Notification survives screen-off and updates on track change
- [ ] `onRemoteCommand` payloads match the iOS shape

**Risk:** `MediaSession` + foreground service + notification is the most
Android-version-sensitive code in this module. Test on API 24 (min), 29, 33 and
34+. Pair with FG-0.1 — the service cannot start at all on 34+ without it.

---

### FG-4.2 — Android music never emits `onProgress`

**Severity:** `PARITY` · **Effort:** S · **Platform:** AND

**Current behavior**
`ObsidianMusicPlayerModule` emits `onState` on playback transitions (`:52-70`)
and `onQueue` on queue changes (`:80-85`), but has no periodic progress
emitter. iOS has one (`ObsidianMusicPlayerModule.swift:26-34`, →
`delegateProgress()` at `:218-222`). So `MUSIC_EVENTS.PROGRESS` never fires on
Android and the `onProgress` handler registered in `useMusicPlayer.ts:75` is
dead code there. The video module shows the pattern: a `postDelayed` runnable at
`ObsidianVideoView.kt:31-41`.

**Implementation flow**
1. Add a `Handler(Looper.getMainLooper())` and a 250 ms runnable mirroring
   `ObsidianVideoView.kt:31-41`, updating `lastState["position"]`,
   `lastState["duration"]` and `lastState["buffered"]`.
2. Send `onProgress` with `{ position, duration }` — the exact shape
   `useMusicPlayer.ts:59-63` reads.
3. Start it in `loadCurrent` (`:123-134`), stop it in `invalidate` (`:197`).
   `invalidate` already releases the session and player, so a leaked runnable
   would keep the module alive.
4. Do **not** emit a full `onState` on every tick — that is a JSON serialise
   plus a bridge crossing 4×/second. Keep `onState` for transitions; that is
   precisely why the two events exist separately.
5. Emit at 4 Hz, matching iOS's `CMTime(seconds: 0.25, …)` interval so the two
   platforms behave identically.

**Verification**
- [ ] `useMusicPlayer().state.position` advances on Android
- [ ] A 10-minute session shows no measurable JS thread growth
- [ ] `invalidate()` leaves no runnable posting after unmount

**Risk:** Low. Add a `removeCallbacks` in `invalidate` — forgetting it is the
classic leak here.

---

### FG-4.3 — (folded into FG-4.1 step 5)

Listed separately in the summary table for visibility; implement it inside
FG-4.1 rather than as separate work.

---

### FG-4.4 — `removeTrack` restarts playback unconditionally

**Severity:** `SILENT-WRONG` · **Effort:** S · **Platform:** AND/IOS

**Current behavior**
Android (`:145`) and iOS (`:113`) both call `loadCurrent()` after removing a
track, regardless of whether the removed track was the one playing. Removing an
unplayed track from a 100-song queue restarts the current song from zero.

**Implementation flow**
1. Capture `val activeId = currentIndex()` **before** mutating `tracks`.
2. Remove, then `rebuildOrder(preserve = true)` — Android already has a
   `preserve` parameter (`:92`) that is exactly for this; iOS has
   `preserveCurrent` (`:58`). Both are already correct, just unused here.
3. If `activeId` is still present, do nothing further. If it was removed, find
   its former position in the old order and move the cursor there, clamped.
4. Only call `loadCurrent()` in that case. Preserve the play/pause state across
   the reload.
5. Handle last-track-removed: stop playback, set `status: 'idle'`, clear the
   queue. Today `currentIndex()` returns `-1` on an empty order
   (`ObsidianMusicPlayerModule.kt:90`) and `loadCurrent` early-returns
   (`:124`), which leaves a stale track loaded.

**Verification**
- [ ] Removing an unplayed track does not interrupt playback or reset position
- [ ] Removing the playing track advances to the next one
- [ ] Removing the final track stops cleanly

**Risk:** Low, but touches queue cursor math — covered by
`__tests__/PlaylistManager.test.ts`.

---

### FG-4.5 — Android `removeDownload` frees no bytes; `clearCache` is unsafe

**Severity:** `SILENT-WRONG` · **Effort:** M · **Platform:** AND

**Current behavior**
- `removeDownload` (`:105-118`) only rewrites the `SharedPreferences` index. The
  comment at `:114-115` states the reason honestly: `SimpleCache` is LRU with
  no per-key eviction. The bytes stay on disk until some unrelated content
  pushes them out. iOS genuinely deletes the file
  (`ObsidianCacheModule.swift:151-159`), so the platforms disagree.
- `clearCache` (`:128-143`) deletes loose files from the cache directory while
  `SimpleCache` still holds locks on them, swallowing every failure in
  `try { … } catch (_: Exception) {}` (`:136`). The result is undefined —
  it may partially work, or corrupt the cache index.
- Also: two `companion object` blocks in one class (`ObsidianCacheModule.kt:14`
  and `:18`) — legal Kotlin, but a smell that suggests a merge accident.

**Implementation flow**
1. Give each download a stable cache key derived from `id`, and record it in
   the index at download time.
2. On `removeDownload`, use `SimpleCache.removeResource(...)` per key — it needs
   a `CacheKey`, so store the resolved `cacheKey` string in the index when the
   entry is created, rather than re-deriving it later.
3. Replace `clearCache` with `cache.removeResource` over every key, or
   `SimpleCache.release()` followed by a directory delete and a fresh
   `getCache` — the current delete-behind-a-live-cache approach cannot be made
   safe. `ExoPlayerProvider.cache` is a `var` (`:25`) precisely so it can be
   nulled and rebuilt; add that reset path.
4. Report failures instead of swallowing them, but keep the promise resolving so
   one bad key cannot reject the whole `clearCache`.
5. Merge the two `companion object` blocks. *(done — promoted to **FG-0.5**,
   because it is a hard compile error, not a smell)*
6. Add `getCacheSize` consistency — see FG-5.5.

**Verification**
- [ ] `removeDownload` reduces `getCacheSize` by approximately the item size
- [ ] `clearCache` followed by immediate playback does not throw
- [ ] LRU eviction still works after a `clearCache`

**Risk:** `SimpleCache` is shared with the players via
`ExoPlayerProvider.getCache` (`:27-35`). Releasing it while an `ExoPlayer` holds
a `CacheDataSource` will crash. Sequence carefully: stop playback → release →
recreate.

---

## Wave 5 — Offline correctness

FG-5.1 is the payoff for the whole download subsystem. Until it lands,
downloading a track and playing it offline does not work — the player fetches
the original URL.

### FG-5.1 — Downloads are never consulted at playback time

**Severity:** `FEATURE` · **Effort:** M · **Platform:** ALL

**Current behavior**
`DownloadManager.download` (`:24-35`) populates a cache; `useMusicPlayer` /
`useAudioPlayer` / `<Video>` pass `source.uri` straight to the native player.
Nothing resolves a cached URI first. `SimpleCache` (Android) is transparent to
`CacheDataSource` **only for media the player requests through it** — an
offline-prefetched entry under a different cache key will not be found.
`MediaSource.cacheable` (`:22`) is honoured by the players
(`ExoPlayerProvider.kt:97-103`) but `DownloadManager` never sets it.

**Implementation flow**
1. Add `DownloadManager.resolveUri(id)` returning the local path/blob URL for a
   completed download, or `null`.
2. Track downloads by `id` on both platforms. `Track` already carries `id`
   (`src/types.ts:60`), so `useMusicPlayer.setQueue` can map `track.id` → cached
   URI before handing tracks to native.
3. Android — pass the resolved local `Uri` into `MediaItem.Builder().setUri(...)`
   at `ObsidianMusicPlayerModule.kt:127`, and in
   `ExoPlayerProvider.prefetchToCache` (`:54`) record the cache key that
   `SimpleCache` assigned so lookups can be exact.
4. iOS — for a completed progressive download, the file already exists at
   `ApplicationSupport/obsidian-media-cache/<id>.<ext>`
   (`ObsidianCacheModule.swift:57-62`); hand `loadCurrent` a
   `file://` URL instead of the remote one when the index says `done`.
5. Resolve in JS, not natively, so the behaviour is identical on both platforms
   and testable without a device.
6. Add an explicit `preferCache?: boolean` to `MediaSource` so a caller can opt
   out — and so a stale cache entry is never a surprise.

**Verification**
- [ ] Airplane mode: a downloaded track plays to completion
- [ ] A non-downloaded track in the same queue still streams when online and errors cleanly when not
- [ ] Corrupting a cached file surfaces a real error, not a hang
- [x] JS-side lookups correct and covered (15 tests in `__tests__/useAudioPlayer.test.tsx`)

**Risk:** Medium. This is where the index, the cache and the players all meet.
Do it after FG-4.5, or the removal semantics will be wrong underneath it.

**Status: steps 1, 2 and 5 landed; 3, 4 and 6 are still open. Not done.**

**What the JS half now does correctly**
- `useMusicPlayer.setQueue` rewrites `source.uri` from `DownloadManager.resolveUri(track.id)`.
  It previously spread a new **top-level `uri`** alongside `source`, and a `Track`
  has no top-level `uri` — so the queue reached the player with the cached path in
  a field nothing reads, and the original remote `source.uri` still in the field
  that *is* read. The rewrite would have been a silent no-op on both platforms.
- `useAudioPlayer.load` now looks up via `DownloadManager.resolveUriForUri(uri)`.
  It previously passed a media URI to `resolveUri(id)`, which matches against
  `DownloadInfo.id` — so the lookup could never match, and the audio path's cache
  resolution was dead code.
- `resolveUri` no longer pretends. The two branches both returned `entry.uri`, with
  a comment admitting "In a full implementation, this would resolve to the actual
  local path" — and `DownloadInfo.localExtension`, which the `if` tested, is **not
  written by either platform**. The index records only `id`, `uri`, `type`,
  `status` and byte counts (`ObsidianCacheModule.kt:60-70`,
  `ObsidianCacheModule.swift` `getDownloads`). That branch was unreachable.
  The doc comment now says plainly what is returned and why that is correct today:
  on Android `SimpleCache` maps *cache keys* to spans and `CacheDataSource` serves
  them, so **requesting the remote URI is how a cached file is played**; there is
  no per-download path to hand a player and none is needed. iOS `URLCache` is the
  same for progressive media. The useful output of the lookup is the existence
  check, not the rewrite.
- `MusicControls.setQueue` and `AudioControls.load` are declared `Promise<void>`
  rather than `void`. Both were already `async`; the declared type was the lie, and
  it is what made the FG-5.1 tests read a native call that had not happened yet.

**Why nothing caught the audio bug: a gap in the test mock, not just missing tests**
`jest.setup.js` never gave the cache mock a `download` method. `hasNativeCache()`
gates on `typeof CacheNative.download === 'function'`, so with no `download` the
gate was false in *every* test and the entire native `DownloadManager` path was
unreachable. The FG-5.1 music tests could therefore only be written by mocking
`resolveUri` itself — and a test that mocks the function under test's collaborator
cannot notice that the collaborator is being called wrongly. `Audio.test.tsx` covers
the `<Audio>` *component*; there was no suite for the `useAudioPlayer` hook at all.
`download` and `prefetchToCache` are now on the mock, and
`__tests__/useAudioPlayer.test.tsx` exercises the real `DownloadManager` against
the native mock rather than stubbing the resolver.

**Mutations confirmed to fail** (5 of 5): `useAudioPlayer.load` back to the
id-keyed resolver, `resolveUriForUri` matching by id, the `done` filter dropped
from `resolveUri`, the `done` filter dropped from `resolveUriForUri`, and the
`download` method removed from the cache mock.

**Steps 3, 4 and 6 as shipped**

**iOS - the one platform with a real local file, now reported.** `upsertEntry`
takes a `localUri`, and the module records `dest.absoluteString` when a
progressive download completes. `DownloadInfo.localExtension` is **replaced by
`localUri`**: an extension alone does not make a path, and JS has no way to know
the app's cache directory, so the old field could never have been usable - nothing
wrote it and nothing could have read it. `resolveUri` returns `localUri` when
present.

Two related defects fixed in the same callback:

- It wrote `uri: location.absoluteString` - the **local** asset path - into the
  index, so `DownloadInfo.uri` reported a `file:` URL for every HLS download and
  the source URL the caller asked for was gone from the library entirely. The
  remote URI is now read back from the existing index entry (`indexURI(for:)`),
  which is correct because the `"downloading"` write already stored it.
- It derived the destination extension from the *source* while `getDownloads`
  re-derived the path from `uri` - which for HLS is a `.m3u8` manifest while the
  file on disk is a media bundle. `getDownloads` stat'd a path that does not exist
  and reported **0 bytes for a completed download**. It now prefers the recorded
  `localUri`.

`localUri` is cleared on any update that does not supply one, and `getDownloads`
drops it if the file has since been deleted. A stale `file:` URL is worse than no
URL: it fails playback outright, where the source URL would at least stream.

**Android - the key is recorded, not assumed.** `ExoPlayerProvider.cacheKeyFor(uri)`
returns `Uri.parse(uri).toString()`, the index stores it as `cacheKey`, and
`removeDownload` / `clearCache` evict that key, falling back to `uri` for entries
written before it existed.

The first attempt asked the cache for the key it had assigned
(`getCache(context).cacheKey` / `getCacheKey(uri)`). **Both are internal in media3
1.3.1** - confirmed with `javap` against `media3-datasource-1.3.1.jar`, and the
Kotlin matrix caught it as `unresolved reference` on both RN versions.
`SimpleCache` exposes no key accessor at all, so the same derivation `CacheKey`
performs is applied instead, which is sound precisely because no caller ever sets
`DataSpec.key`; the KDoc says so, so a future custom key invalidates it loudly.

This is a real fix, not a rename: `CacheKey`'s default is the **normalised**
`uri.toString()`, and `Uri.parse` normalises default ports and some
percent-encodings. FG-4.5's `removeResource(uri)` passed the raw string, so where
the two differ, eviction silently removed nothing while the index entry
disappeared.

`isCachedFor(context, uri)` was added for the LRU case - the index says `"done"`
but `SimpleCache` may have evicted the spans since. It is currently **unused**,
noted rather than left as silent speculative surface.

**Step 6 - `preferCache` closed as redundant, not implemented.** The plan proposed
a new `MediaSource.preferCache` flag "so a caller can opt out - and so a stale
cache entry is never a surprise". `MediaSource.cacheable` already exists, is
already in the public type, and is already threaded to both players
(`buildDataSourceFactory(context, cacheable)` on Android,
`ObsidianVideoPlayer.load(_:headers:cacheable:)` on iOS). A second flag would have
given one concept two spellings, one of which the platform ignores - which is how
`MediaSource.type: 'smooth'` shipped in the first place.

The real gap was narrower: `cacheable: false` was honoured by the native players
but **not by the JS lookup**, so a source the player had been told not to cache
would still be rewritten to a local copy. `setQueue` and `load` now skip the
lookup when `cacheable === false`, and `MediaSource.cacheable`'s doc comment says
the JS path honours it.

**What is still needed: device verification only.** The three boxes at the top of
this section - airplane mode, a non-downloaded track in the same queue, a corrupt
cached file - all need hardware. JS-level correctness is not the same claim as "a
downloaded track plays in airplane mode", and this item should not be closed on
the strength of the former. The `isCachedFor` LRU check and the `cacheable: false`
opt-out are untested by device.

**Not verified:** no Swift compiled and no Kotlin run. The Kotlin matrix
type-checks all 8 files against real artifacts on RN 0.74 and 0.80, so
`cacheKeyFor` and the index writes are known to compile. The iOS changes satisfy
only the static spec/registration cross-check, which says nothing about whether the
new `localUri` value is something `AVPlayer` can open.

**Coverage added after the implementation landed.** The JS half of FG-5.1 is now
pinned by 12 new tests across the two hook suites (229 total, 14 suites). Five
mutations were re-introduced individually and each is caught by at least one test:

| Mutation | Caught by |
|---|---|
| `resolveUri` ignores `localUri` | 1 failure |
| `resolveUriForUri` ignores `localUri` | 1 failure |
| `setQueue` rewrites a top-level `uri` (the original bug) | 5 failures |
| `setQueue` ignores `cacheable: false` | 1 failure |
| `useAudioPlayer.load` ignores `cacheable: false` | 1 failure |

`useAudioPlayer.test.tsx` grew from 15 to 23 tests. Both suites also gained a
`beforeEach` clearing the shared native mocks: they are module-level singletons,
`music.setQueue` call history survived between tests, and that is invisible to
`toHaveBeenCalledWith` (which matches any call) while silently breaking any
assertion that reads `mock.calls[0]` - which is how the first draft of the
`localUri` tests passed against a resolver that did not prefer `localUri` at all.

**What is NOT pinned, and cannot be here**

- **`cacheKeyFor` normalisation** (Android) and the **HLS `uri` / `getDownloads`
  fixes** (iOS) are native. `android/` has no `src/test` source set and no
  `testImplementation`/JUnit dependency, so there is nothing to hang a Kotlin unit
  test on, and the Gradle build cannot run on this host anyway (FG-0.6). Swift has
  no runner at all. These need a test source set plus the Gradle/macOS CI jobs -
  the same work as FG-0.6's remaining half.
- **Device behaviour** is unchanged from the three boxes at the top of this
  section: airplane mode, a mixed queue, a corrupt cache file.

---

### FG-5.2 — No download progress; `bytesTotal` is never meaningful

**Severity:** `DEAD-API` · **Effort:** M · **Platform:** AND/IOS

**Current behavior**
`DownloadInfo` (`src/core/DownloadManager.ts:5-11`) declares
`bytesDownloaded` and `bytesTotal`, and `ObsidianCacheModule.kt:68-69` seeds
both to `0` — but nothing ever updates them. On completion, Android writes
`bytesDownloaded = SimpleCache.cacheSpace` (`:85`), which is **total cache
space, not this item's size**. So the field is populated and wrong.
`DownloadManager.getDownloads` casts the raw JSON to `DownloadInfo[]` (`:48`)
without validating. There is no `onDownloadProgress` event, so an app can only
poll.

**Implementation flow**
1. Extend `NativeObsidianCache.ts` (`:7-11`) with an optional progress event
   alongside the existing five methods.
2. Android — replace the raw `Thread` in `download` (`:75-93`) with a
   `CacheDataSource` length listener, or read the entry's length from
   `SimpleCache` once complete. Set real `bytesDownloaded` / `bytesTotal` from
   the content length, not from `cacheSpace`.
3. iOS — `URLSession.downloadTask` gives a `Content-Length`; write
   `bytesTotal` at start and `bytesDownloaded` on completion (the size is
   already read at `:126-128`, just not stored).
4. Emit progress events from both; have `DownloadManager` re-emit them on a
   JS-level emitter so `useDownload` can subscribe.
5. Add a `useDownload(id)` hook returning `{ info, progress, cancel }` — the
   package has hooks for every other surface and downloads are the only one
   without one.
6. Validate the native payload before casting. A malformed index should yield
   `[]`, not a runtime crash inside a consumer's `.map`.

**Verification**
- [ ] Progress advances monotonically and reaches 100%
- [ ] `bytesDownloaded === bytesTotal` on completion for a real file
- [ ] A 404 yields `status: 'error'` with a message

**Risk:** Changing the `NativeObsidianCache` spec means a codegen re-run. Since
`codegenConfig.type` is `"all"` (`package.json:87`), that is automatic — but
consumers must rebuild, so it needs a minor bump.

---

### FG-5.3 — iOS HLS download reports `"done"` after a hardcoded 2 s

**Severity:** `SILENT-WRONG` · **Effort:** M · **Platform:** IOS

**Current behavior**
`ObsidianCacheModule.swift:88` creates
`AVAssetDownloadURLSession(configuration:assetDownloadDelegate: nil, …)` — with
a `nil` delegate, so no completion callback ever fires. Lines `:96-98` then mark
the entry `"done"` after a hardcoded `DispatchQueue.global().asyncAfter(deadline: .now() + 2)`.

So an HLS download reports success two seconds after starting, regardless of
outcome. A user deleting a track they believe is offline gets a broken player.

**Implementation flow**
1. Implement `AVAssetDownloadDelegate` on `ObsidianCache` and pass a real
   instance at `:88`. This is the actual fix.
2. Drive status from the delegate callbacks: `didLoad` → `downloading` with
   real progress from `timeRangeWaitingToPlay` / `loadedTimeRanges`;
   `didFinishDownloadingTo` → `done` with the on-disk location;
   `didCompleteWithError` → `error` with the message.
3. Guard the `if #available(iOS 10.0, *)` at `:84` — dead code at a 13.0
   deployment target (`:14`).
4. The comment at `:90-91` claims FairPlay is required for persistence. That is
   not accurate for unencrypted HLS: `AVAssetDownloadURLSession` persists
   ordinary HLS. Only `AVContentKeySession` needs the entitlement. Verify
   against a real unencrypted `.m3u8` before assuming the fallback path is
   needed.
5. If the entitlement genuinely is required, say so by resolving
   `status: 'error'` — never `"done"`.
6. Persist the `AVAssetDownloadTask` across app launches; today a backgrounded
   download is lost (README roadmap row 4, `README.md:371`).

**Verification**
- [ ] A 200 MB HLS stream reports `downloading` for the duration and `done` at the end
- [ ] A mid-transfer network drop reports `error`, not `done`
- [ ] Killing and relaunching the app resumes or cleanly restarts the download

**Risk:** `AVAssetDownloadURLSession` is easy to get subtly wrong and hard to
test. Budget a real device with a real HLS stream, not a simulator.

---

### FG-5.4 — Android `prefetchToCache` blocks a thread for the whole file

**Severity:** `SILENT-WRONG` · **Effort:** M · **Platform:** AND

**Current behavior**
`ExoPlayerProvider.prefetchToCache` (`:66-72`) opens a `DataSource` and drains
it in a `while (dataSource.read(buffer, 0, buffer.size) != -1)` loop on a raw
`Thread` (`:75` in `ObsidianCacheModule.kt`). For a 2 GB video that is a
full download occupying a thread, with no cancellation, no progress, no
timeout and no backpressure. `Exception` is swallowed at `:73-75`, so a failure
marks the entry `"error"` with no message.

**Implementation flow**
1. Use `CacheWriter` / `CacheDataSink` (or a `ProgressDataSource`) instead of a
   manual read loop, so Media3 handles buffering and the sink protocol
   correctly.
2. Track a `Future` per download id and expose `cancel(id)` through
   `DownloadManager`, so the UI can abort a large download.
3. Stream progress (this is the natural hook for FG-5.2).
4. Add a timeout and a size ceiling — a `CacheDataSource` on an unbounded
   response can fill the disk. `SimpleCache` is capped at 200 MB
   (`ExoPlayerProvider.kt:31`) so the cache itself is safe, but the *in-flight*
   download is not.
5. Replace `Thread { }` with a shared `ExecutorService`, so ten downloads do not
   spawn ten unbounded threads.
6. Log the swallowed exception rather than discarding it.

**Verification**
- [ ] A large download does not block the JS thread or the UI
- [ ] Cancelling mid-transfer releases the connection
- [ ] Ten concurrent downloads do not exhaust the thread pool

**Risk:** Medium. `SimpleCache` requires writes through a proper
`CacheDataSink`; the manual loop is a shortcut that happens to work for
progressive files but is not correct in general.

---

### FG-5.5 — `getDownloads()` / `getCacheSize()` shapes differ per platform

**Severity:** `PARITY` · **Effort:** M · **Platform:** AND/IOS

**Current behavior**
`getDownloads` returns the raw `SharedPreferences` index on Android
(`ObsidianCacheModule.kt:120-126`) and the `UserDefaults` index on iOS
(`ObsidianCacheModule.swift:164-181`). The two indexes have drifted: iOS always
refreshes `bytesDownloaded`/`bytesTotal` from the file size when `status ==
"done"` (`:170-175`); Android returns whatever was last written, which is
`cacheSpace` (`:85`). Neither validates shape before returning.

`getCacheSize` is worse. Android returns `SimpleCache.cacheSpace` (`:146`) —
bytes in the shared 200 MB cache. iOS returns on-disk files **plus
`URLCache.shared.currentDiskUsage`** (`:203`), which includes unrelated HTTP
caching. Two platforms, two different meanings, one method name.

**Implementation flow**
1. Define one `DownloadInfo` contract and normalise both platforms to it:
   `{ id, uri, status, bytesDownloaded, bytesTotal, contentType?, storedAt? }`.
   `src/core/DownloadManager.ts:5-11` is already the right shape — make the
   native layers match it rather than casting.
2. Add `scope: 'module' | 'system'` to the cache-size result, or split into
   `getCacheSize()` (module-only) and document the platform difference. Do not
   keep one name with two meanings.
3. Validate and coerce on both platforms before resolving — a malformed index
   should degrade to `[]`, never crash a consumer.
4. Add `status: 'paused'` for cancelled downloads so FG-5.2's `cancel` has
   somewhere to land.
5. Add JS tests that assert a normalised shape from a mocked native module, so
   the contract is enforced on the JS side regardless of platform.

**Verification**
- [ ] Identical `getDownloads()` output shape on both platforms
- [ ] `getCacheSize()` means the same thing on both
- [ ] A corrupt index resolves to `[]` instead of throwing

**Risk:** Low. Purely a contract change — but it touches the TurboModule
surface, so it needs a codegen re-run and a minor bump.

---

## Wave 6 — Net-new capability

**Do not start this wave until Waves 0-5 are merged and stable.** Each item
needs its own spec; the shape of the public API should be agreed before code is
written.

> **D4 was answered (b): DRM is not shipping.** FG-6.1 and FG-6.2 are **struck**
> and retained below only as a record of what was rejected and why. The
> replacement work is **FG-6.5**, which *removes* the claim. FG-6.5 is cheap and
> belongs early — it stops consumers building on a passthrough — even though it
> is filed here.

### ~~FG-6.1~~ — DRM: Widevine (Android) — **STRUCK, D4(b)**

**Severity:** `FEATURE` · **Effort:** L · **Platform:** AND

`ExoPlayerProvider.kt:110-113` has the hook and a comment. Implementing it means
`DefaultDrmSessionManager` + `HttpMediaDrmCallback` (or
`HttpDataSource` for the licence), a `DrmConfiguration` on the `MediaItem`, and
`setMediaItem` rather than `setMediaSource` (DRM requires `MediaItem` to carry
the configuration). Offline licence persistence is a separate, larger problem —
decide explicitly whether it is in scope, because "downloadable" and "DRM" are
mutually exclusive without it. **Not committing to this.**

### ~~FG-6.2~~ — DRM: FairPlay (iOS) — **STRUCK, D4(b)**

**Severity:** `FEATURE` · **Effort:** L · **Platform:** IOS

`AVContentKeySession` requires an `AVAssetResourceLoaderDelegate`, a CKE
negotiation round-trip and a licence server. `_ = drmLicenseUri` at
`ObsidianVideoPlayer.swift:81` marks the spot. Needs the
`com.apple.developer.fps` entitlement and a real key server to develop against —
this cannot be built blind. **Not committing to this.**

### FG-6.5 — Remove the DRM claim (D4(b))

**Severity:** `DEAD-API` · **Effort:** S · **Platform:** ALL

**Current behavior**
`MediaSource.drmLicenseUri` is a declared public field (`src/types.ts:20`) that
is threaded through `sourceToJson` (`src/utils/media.ts:4`) into every native
load path, where it is explicitly discarded:

- Android — `ExoPlayerProvider.kt:110-113` has the `if (drmLicenseUri != null)`
  branch with no body
- iOS — `ObsidianVideoPlayer.swift:81` is `_ = drmLicenseUri`
- Both call sites pass the argument all the way down purely to drop it

Worse, `package.json:4` advertises DRM in the package description, so the
promise reaches users who never read the type definitions.

**Implementation flow**
1. Remove `drmLicenseUri` from `MediaSource` in `src/types.ts:20`, including its
   doc comment.
2. Remove it from `sourceToJson` (`src/utils/media.ts:4`).
3. Android: drop the parameter from `buildMediaSource` and delete the empty
   branch at `ExoPlayerProvider.kt:110-113`; update the call site in
   `ObsidianVideoView.kt:load`.
4. iOS: drop the parameter from `load(...)` and delete `_ = drmLicenseUri`
   (`ObsidianVideoPlayer.swift:81`) plus its comment; update the call site in
   `ObsidianVideoView.swift:40`.
5. Remove DRM from the `package.json:4` description.
6. Remove README roadmap row 3's Smooth Streaming/DRM coupling if it is phrased
   as available-now, and note in the changelog that DRM is **not** supported and
   was never wired up.
7. Re-add later only with FG-6.1/FG-6.2 actually implemented — a real key server,
   not a stub.

**Verification**
- [ ] Repo-wide grep for `drmLicenseUri` / `drm` returns nothing but this doc
- [ ] `npm run typecheck`, `npm run lint`, `npm test` clean
- [ ] A non-DRM stream still plays (the `else` path is what most users hit, so
      this is the regression risk)

**Risk:** Breaking TS change for anyone who set the field → minor bump. Given it
never did anything, that is a fair trade.

### FG-6.3 — Casting (Chromecast / AirPlay)

**Severity:** `FEATURE` · **Effort:** L · **Platform:** ALL

`CastManager` (`src/core/CastManager.ts`) already has the right shape —
`discover` / `connect` / `disconnect` / `onDeviceChange` — and is a no-op
(`:16-18`). Android needs the Google Cast SDK plus a `CastPlayer`; iOS needs
`AVRoutePickerView` + `GCKDiscoveryManager` or `GCKSessionManager`. Note that
`AVAudioSession` already opts into AirPlay at
`ObsidianMusicPlayerModule.swift:174` and `ObsidianAudioEngine.swift:50`, so
*system* AirPlay already works — only *app-initiated* casting is missing. That
distinction belongs in the README.

### FG-6.4 — `Track.artwork` and `Track.duration` are decoded then discarded

**Severity:** `DEAD-API` · **Effort:** M · **Platform:** ALL

`Track.artwork` and `Track.duration` are declared (`src/types.ts:66,68`) and
decoded (`ObsidianRemoteControls.swift:73-74`) but never used. iOS
`updateNowPlaying` sets title, artist, album and duration but not
`MPMediaItemPropertyArtwork` (`ObsidianMusicPlayerModule.swift:189-200`).
Android's `Track` (`:30-39`) has no artwork field at all, and the foreground
notification has no image (FG-4.1 will need one).

Implementation is small: load the image, set `MPMediaItemPropertyArtwork` on
iOS, add a `NotificationCompat` large icon on Android, and set
`navigator.mediaSession.metadata.artwork` on web (FG-2.3). Do it **with**
FG-4.1, since that is where the notification is built.

---

## Wave 7 — Cross-cutting

### FG-7.1 — `PlaybackState.inBackground` is permanently `false`

**Severity:** `DEAD-API` · **Effort:** S · **Platform:** ALL

Declared at `src/types.ts:53` and initialised in all four native state maps
(`ObsidianVideoView.kt:28`, `ObsidianAudioModule.kt:28`,
`ObsidianMusicPlayerModule.kt:49`, `ObsidianVideoPlayer.swift:31`,
`ObsidianAudioEngine.swift:22`, `ObsidianMusicPlayerModule.swift:19`) — and
never set to `true` anywhere.

Either (a) wire it: Android — `ProcessLifecycleOwner` or
`onHostPause`/`onHostResume` on the modules; iOS — `UIApplication` notification
observers, flipped on `setBackgroundEnabled` for music. Or (b) delete it from
`PlaybackState` and `INITIAL_STATE` (`src/utils/media.ts:20-29`). Recommend
(a) for music (it is genuinely meaningful there, since the module already owns a
foreground service) and (b) for video and audio.

### FG-7.2 — Expo plugin requires an undeclared dependency

**Severity:** `BUILD` · **Effort:** S · **Platform:** BUILD
*(README roadmap row 10, `README.md:377`)*

`plugin/index.js:1` does `require('@expo/config-plugins')` at module scope, but
`package.json` declares no `peerDependencies` for it. Move it to
`peerDependenciesMeta.optional`, or lazy-require inside `withObsidian` with a
helpful message. Also: `withAndroidManifest` (`:24-30`) is a no-op that returns
`cfg` unchanged — either give it the manifest work it implies (it is the natural
home for FG-0.1's permission) or delete the call.

### FG-7.3 — Test coverage is one 53-line file

**Severity:** `BUILD` · **Effort:** L · **Platform:** JS

`__tests__/PlaylistManager.test.ts` was the **only** test file — 9 cases over
`src/core/PlaylistManager.ts`, which is the only pure, easily testable module in
the package. Nothing covered components, hooks, `DownloadManager`,
`MediaProvider`, or any native code.

Priority order as Waves land:
1. ~~`MediaProvider` + `useMusicPlayer` with a mocked `MusicPlayerNative`~~ — **done** (FG-1.1, FG-1.4, FG-1.6)
2. `PlaylistManager` — extend for FG-4.4's cursor edge cases
3. `DownloadManager` normalisation (FG-5.5)
4. ~~`Video` prop→command mapping with a mocked codegen component~~ — **done** (FG-1.3, FG-1.5)
5. ~~`useVideoPlayer` state~~ — **done** (FG-1.2)

Add a CI job running `npm run typecheck && npm run lint && npm test` plus the
web bundle from FG-2.1 step 6. Without it, every future wave can regress the one
that preceded it.

**What landed in Wave 1**

| File | Tests | Covers |
|---|---|---|
| `__tests__/Video.test.tsx` | 18 | FG-1.3 (`getState` liveness, handle stability, `flush`), FG-1.2 (`useVideoPlayer` state, `onState`, `controls` identity), prop→command mapping, `onEvent` stream |
| `__tests__/MediaProvider.test.tsx` | 10 | FG-1.1 (`controls` on the first render, `INITIAL_STATE` seed, position propagation, `toggle`, `setTracks`) |
| `__tests__/useMusicPlayer.test.tsx` | 10 | FG-1.4 (all 6 events, `onEnded`/`onError` behaviour), FG-1.6 (listener bookkeeping) |
| `__tests__/MusicPlayer.test.tsx` | 6 | FG-1.3 (`getState`/`getQueue` liveness, handle stability), FG-1.1 (`onEvent` on progress), loop guard |
| `__tests__/Audio.test.tsx` | 5 | FG-1.3 extended to `<Audio>` (handle liveness, `onEvent` on progress), loop guard |
| `__tests__/helpers.tsx` | — | `renderHook` shim, native mock accessors, `emitNative` |

Supporting files: `jest.setup.js` (native module mocks, installed via
`setupFiles` because `src/native/*Native.ts` resolve at import time and throw
when the module is absent) and `jest.config.js`. Added
`react-test-renderer@18.2.0` + `@types/react-test-renderer` as devDependencies.

Events are emitted through the real `DeviceEventEmitter` rather than a stub, so
the tests exercise `NativeEventEmitter`'s actual bridging.

### Verifying the regression tests

A test that never failed proves nothing. Every new test was run against the
**pre-fix code** by stashing the fix and re-running:

```bash
git stash push -- src/context/MediaProvider.tsx
npx jest __tests__/MediaProvider.test.tsx --json
git stash pop
```

| Suite | Failures against pre-fix code |
|---|---|
| `MediaProvider.test.tsx` | 5 of 10 |
| `Video.test.tsx` | 11 of 18 |
| `Audio.test.tsx` | 3 of 5 |
| `MusicPlayer.test.tsx` | loop guard, verified separately below |

This step earned its keep four times.

**It caught a useless test.** The first version of the `MediaProvider` harness
kept only the *latest* context value. Against the broken code the bug was masked
by any subsequent re-render repopulating `ref.current`, so 9 of 10 tests
incorrectly passed. Recording the context seen on *every* render and asserting on
`renders[0]` is what made the suite fail as it should.

**It caught a regression I introduced.** The first version of the `MusicPlayer`
`onEvent` effect listed `onEvent` in its dependency array. Because consumers
almost always pass an inline arrow, that gave a fresh identity on every render →
effect re-ran → called back into the parent → `setState` → re-render, an infinite
loop. Holding `onEvent` in a ref (`MusicPlayer.tsx:61`) keeps it out of the
dependency list while still calling the latest callback. This would have hit
essentially every real consumer, and no amount of reading the diff surfaced it as
reliably as running the old code against the new tests.

**It then caught a bad test of my own.** The first version of the loop guard was
uncapped, so re-introducing the bug made the suite *hang* rather than fail — no
verdict, no CI signal, and the earlier "it hangs" symptom masked everything else
in the run. Capping the re-render chain at 200 converts the hang into an 8-second
assertion failure. A regression guard that hangs is not a guard.

**It found a gap the plan missed entirely.** `<Audio>` had the same two defects
as `<Video>` and `<MusicPlayer>` — a handle closing over `state`, and `onEvent`
gated on `state.status` — plus a dead ternary, `status === 'playing' ? 'state' :
'state'`, whose branches were identical. FG-1.3 was extended to cover it rather
than leaving a knowingly inconsistent fix. `Audio.web.tsx` was already correct
(it used a `stateRef`), which is what made the native one look wrong by
comparison.

---

## Sequencing

```
Wave 0  ──▶ release blockers        DONE — FG-0.6's CI half unproven
   │
Wave 1  ──▶ public API correctness  DONE
   │
Wave 2  ──▶ web parity             DONE — FG-2.1 … FG-2.5
   │
Wave 3  ──▶ iOS architecture       DONE — 4 hard build failures fixed
   │
Wave 4  ──▶ Android media session  DONE — FG-4.0 … FG-4.5
   │
Wave 5  ──▶ offline correctness    IN PROGRESS — FG-5.1 implemented, unverified
   │
Wave 6  ──▶ new capability         DONE — FG-6.3, FG-6.4; FG-6.1/6.2 struck
   │
Wave 7  ──▶ cross-cutting          not started
```

Per-item status, evidence and the list of what is *not* verified is in
[`progress.md`](./progress.md). Everything through Wave 6 minus FG-5.1–5.5
shipped together in `0.5.0`; there is no separate per-wave version, because
nothing was published between `0.1.5` and now.

**Parallelisable:** Wave 2 (web) and Wave 4 (Android) share no files — they can
proceed in parallel once Waves 0 and 1 land. Wave 3 is independent of both but
should not start before D1 is answered.

**Hard dependencies:**
- FG-0.6's Gradle CI job gates everything — no item after it can be verified
  without a build. Its **local** half has landed (`npm run verify:android`), which
  covers Kotlin but not manifest, CMake or runtime. The CI half is written
  (`.github/workflows/ci.yml`) but has never run, so this gate is still open in
  substance even though the file exists
- FG-4.0 is now the highest-risk item in the plan and can be worked on safely,
  because FG-0.6's local gate will catch a Kotlin regression in it
- FG-4.1 requires FG-0.1 (the service cannot start on API 34+ without the permission)
- FG-4.1 requires FG-4.0 (the notification needs a session owned by something
  that outlives the React module)
- FG-5.1 requires FG-4.5 (removal semantics must be correct before offline resolution builds on them)
- FG-6.4 pairs with FG-4.1 (both build the notification)
- Everything after Wave 0 requires FG-7.3's CI job, or there is no safety net
- Appendix A is **not** scheduled. Its only entry dependency is FG-4.0 for the
  Android half, and D5 for anything touching the audio signal

---

## Non-goals

Explicitly **out of scope** for this plan. Do not let these creep in:

- **Picture-in-picture.** Not modelled in any spec, not mentioned in the README.
- **Subtitles / captions.** No `MediaSource` field, no native handling.
- **A custom player UI.** Every component is headless by design. The README is
  explicit that consumers bring their own.
- **Analytics / telemetry.** Nothing in the package collects anything.
- **A second video surface** (SurfaceView vs TextureView toggle). Android uses
  TextureView; that is a reasonable default, not a gap.
- **Old Architecture on Android.** FG-3.1 is iOS-specific; the Android path uses
  `BaseReactPackage` (`ObsidianMediaPlayerPackage.kt:25`) and resolves on both.

---

## Definition of Done

An item is done when **all** of the following hold:

- [ ] The behaviour is implemented on **every** platform it claims, or the
      claim is removed from the type, the README and the spec
- [ ] `npm run typecheck`, `npm run lint` and `npm test` are clean
- [ ] A test covers the new behaviour, or the reason it is untestable is written down
- [ ] `README.md` matches the code — including the Permissions section, the
      capability table (`:238`) and the roadmap table (`:360-377`)
- [ ] A new `### <version>` changelog entry exists if the change is
      user-visible
- [ ] For native changes: verified on a real device or emulator, not just compiled
- [ ] For anything breaking: a minor version bump, and the migration note in
      the changelog

---

## Appendix A — Vision: the media-framework roadmap

**This is not a work plan.** It is the destination, kept so that the plan above
stays aimed at something. Nothing here is scheduled, estimated, or committed to,
and none of it may be started while Waves 0–5 are open. It is separated from the
waves on purpose: the failure mode this section exists to prevent is feature work
being scheduled ahead of the crashes and parity gaps that are already known.

### What is actually being proposed

The proposition is that `obsidian-media-player` stops being a player wrapper and
becomes a **native media engine** — native media session, native event bus, a
queue engine, a real DSP chain, cache/preload, and diagnostics — with the React
layer reduced to an adapter. The strategic argument is sound: the three libraries
it would replace each own one slice, and a package that owns the whole pipeline
owns the failures.

**Two corrections to how this was originally framed, because both change the
estimate:**

1. **DSP is not "the big missing part" with stubs to replace — there is nothing
   there.** No EQ, effects, ReplayGain, crossfade, gapless, pitch, waveform or
   analysis exists in any form, native or JS. It is greenfield on both
   platforms, and on iOS it is constrained by `AVPlayer` having no insertable
   processing graph. See **D5**, which must be answered before any of it is
   scheduled.
2. **There is no 250ms JS polling loop to eliminate.** The package is already
   event-driven from JS: a native `addPeriodicTimeObserver` at 0.25s
   (`ObsidianMusicPlayerModule.swift:27`) *pushes* progress to JS, and the hooks
   subscribe through `NativeEventEmitter`. The store / state-machine / sync-hook
   layer in the original diagram is the consuming app's, not this package's. The
   real gap here is one-sided: **Android music emits no progress at all**
   (FG-4.2), which is a five-line fix, not an architecture change.

### Trimmed to what has an emitter on both platforms

The original draft specified 8 repeat/shuffle modes, ~28 native events and 15
hooks. Those counts are aspirational in a way that is actively harmful to copy
into a plan: every event is a permanent three-platform contract, and this repo has
already spent Wave 1 deleting events that were emitted but never received
(FG-1.4) and listeners that were double-counted (FG-1.6).

| Area | Shipped today | Realistic next | Long-term vision |
|---|---|---|---|
| Transport | play/pause/stop/seek/rate/volume/mute | + `seekBy`, `skipForward/Backward` | pitch-preserving rate |
| Queue modes | 3 (`off`/`track`/`queue`) | + `SHUFFLE_ALBUMS` (needs `album` on Android's `Track`, `ObsidianMusicPlayerModule.kt:30-38`) | weighted, history-aware, "similar to this" |
| Queue ops | setQueue/addTracks/removeTrack/skipTo | + insert/move/reorder (FG-4.4 first) | save/restore, undo, snapshots |
| Events | 6–7 per surface | + audio focus, interruption, route, noisy, buffering (all absent today) | ~20, added only with emitters on **both** platforms |
| Hooks | 5 | + `useQueue`, `useBuffering`, `usePlayerError` | per-feature hooks as each lands |
| Background | iOS real; Android broken (FG-4.0) | FG-4.0 → FG-4.1 | process-death recovery, persistence |
| Lock screen / Now Playing | iOS real; Android inert | FG-4.1 + FG-6.4 (artwork) | browse tree, Android Auto |
| Cache | Android `SimpleCache` real; iOS files | FG-4.5, FG-5.1 (offline actually works) | preloading, artwork/metadata cache |
| Streaming | HLS/DASH, headers, live | retry/reconnect, buffer config | DRM (needs infrastructure — see D4) |
| Errors | bare `message` string | structured `PlaybackError` (code/category/recoverable) | — |
| Diagnostics | none | `getDiagnostics()`, log ring buffer | perf counters, crash recovery |
| **DSP** | **nothing** | **D5 first** | EQ, ReplayGain, effects, analysis |

The last two rows are the ones that carry the "media engine" thesis, and both are
cheap next to DSP. A structured error type and a diagnostics snapshot are days of
work and they are what a consumer debugging native instability actually needs.

### Architectural principles worth keeping

These are the parts of the original draft that are right regardless of
sequencing, and they constrain any future work:

- **Design the pipeline, not the pile of features.** A decoder → crossfade →
  gain → EQ → dynamics → output chain with a bypass at every stage is an
  architecture. `setEqualizer()` as an isolated method is not, and retrofitting
  one later means touching every node. (Constrained by D5.)
- **One authoritative state model.** Native state is the source of truth; the
  consumer's store is a UI projection. This package already does this.
- **Add an event in the same commit as the emitter on both platforms**, or not at
  all. A spec field with one native implementation is the exact defect class that
  FG-0.4 and FG-1.4 were written to remove.
- **Delete rather than stub.** The 0.3.0 release closed `drmLicenseUri` and
  `type: 'smooth'` by removal. That is the precedent: a non-functional API is
  worse than an absent one, and every "stub" in this table is a promise the
  package has already decided not to keep.
- **Keep the components headless.** No player UI, ever. The package stays
  replaceable and Lumora keeps its own design system.

### What would have to be true to make this a 1.0 target

Stated plainly, because the original draft proposed "Phase 1 + 2 + core DSP" as
the 1.0 target and that is a multi-quarter commitment for one person — roughly
the combined scope of the three libraries it would replace:

1. FG-0.6 green: a CI job that compiles the module, with a proof it can fail.
2. Waves 0–5 merged. The known crashes, DEAD-API and PARITY gaps are closed, and
   Android offline playback works.
3. FG-4.0 merged: the service owns the player. Every later Android feature —
   including Android Auto, persistence and crash recovery — depends on it, and
   Android has no audio focus handling at all until it does.
4. **D5 answered**, with the iOS `AVPlayer` vs `AVAudioEngine` trade-off written
   down and accepted.
5. The structured-error and diagnostics work done, because they are what makes
   the remaining native work debuggable.

Steps 1–3 are prerequisites, not optional extras. DSP is the only part of this
vision that is genuinely expensive, and D5 exists to stop it from being
attempted first.
