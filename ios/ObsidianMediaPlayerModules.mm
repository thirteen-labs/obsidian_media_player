/**
 * Bridge registration for the ObsidianMediaPlayer pod.
 *
 * Everything React needs from the native side that Swift cannot express lives
 * here. There are three separate reasons, and none of them is "add
 * RCT_EXPORT_MODULE for good measure" — that was the plan's starting guess and
 * it is wrong in both directions. Verified against the react-native 0.73
 * sources in `node_modules` rather than assumed; see to-be-done.md FG-3.1.
 *
 * ---------------------------------------------------------------------------
 * 1. The TurboModules resolve WITHOUT RCT_EXPORT_MODULE.
 *
 *    `RCTTurboModuleManager._getModuleClassFromName:` falls through to
 *    `getFallbackClassFromName()`, which is `NSClassFromString(<name>)`. The
 *    Swift classes are declared `@objc(ObsidianAudio)` and friends, so the
 *    plain class name already resolves. Registration is not merely unnecessary
 *    here, it would be dead code: the `RCTGetModuleClasses()` scan that
 *    `RCT_EXPORT_MODULE` feeds runs *after* the class-name fallback.
 *
 * 2. But `RCTTurboModule` conformance cannot be written in Swift.
 *
 *    Codegen emits
 *      @protocol NativeObsidianAudioSpec <RCTBridgeModule, RCTTurboModule>
 *    and `RCTTurboModule` requires
 *      - (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
 *          (const facebook::react::ObjCTurboModule::InitParams &)params
 *    A C++ signature in an Objective-C protocol is not implementable from
 *    Swift, so the conformance has to be an Objective-C++ category — which is
 *    exactly what RN's own modules do (compare RCTLinkingManager.mm).
 *
 *    Note the protocol names: codegen derives them from the *spec file* name,
 *    so they are `NativeObsidianAudioSpec`, `NativeObsidianCacheSpec` and
 *    `NativeObsidianMusicPlayerSpec` — not `ObsidianAudioSpec` &c. The Swift
 *    files used to declare the latter, which does not compile.
 *
 * 3. `<ObsidianVideo>` needs registration, and it is a different mechanism.
 *
 *    The video surface is a Paper `RCTViewManager` rendered through Fabric's
 *    legacy-view-manager interop layer (to-be-done.md FG-3.3). That layer
 *    resolves the manager class by name, but it still needs:
 *      - the manager in the bridge's module registry, which `RCT_EXTERN_MODULE`
 *        does, and
 *      - every command exposed as an `RCT_EXPORT_METHOD`, which
 *        `RCT_EXTERN_METHOD` does. Without them the interop coordinator finds
 *        no method and logs `No command found with name "play"`, so all eight
 *        handle commands silently do nothing.
 *
 *    It also needs the allowlist opt-in at the bottom of this file, or the
 *    component never reaches the interop layer at all.
 */

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTLegacyViewManagerInteropComponentView.h>
#import <React/RCTViewManager.h>

// The codegen output. Objective-C++ only, which is why this is a .mm file and
// why the bridging header cannot import it.
#import <ObsidianMediaPlayerSpec/ObsidianMediaPlayerSpec.h>

// The Swift classes as seen from Objective-C++. Every class below is
// `@objc`-annotated for exactly this reason.
#import "ObsidianMediaPlayer-Swift.h"

#pragma mark - ObsidianAudio

@interface ObsidianAudio (ObsidianMediaPlayerTurboModule) <NativeObsidianAudioSpec>
@end

@implementation ObsidianAudio (ObsidianMediaPlayerTurboModule)

// `RCT_EXPORT_MODULE` would normally supply this, and `RCTBridgeModuleNameForClass`
// calls `[cls moduleName]` unconditionally while instantiating the module. No
// implementation is an unrecognised selector, not a nil return.
+ (NSString *)moduleName
{
  return @"ObsidianAudio";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeObsidianAudioSpecJSI>(params);
}

@end

#pragma mark - ObsidianMusicPlayer

@interface ObsidianMusicPlayer (ObsidianMediaPlayerTurboModule) <NativeObsidianMusicPlayerSpec>
@end

@implementation ObsidianMusicPlayer (ObsidianMediaPlayerTurboModule)

+ (NSString *)moduleName
{
  return @"ObsidianMusicPlayer";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeObsidianMusicPlayerSpecJSI>(params);
}

@end

#pragma mark - ObsidianCache

@interface ObsidianCache (ObsidianMediaPlayerTurboModule) <NativeObsidianCacheSpec>
@end

@implementation ObsidianCache (ObsidianMediaPlayerTurboModule)

+ (NSString *)moduleName
{
  return @"ObsidianCache";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeObsidianCacheSpecJSI>(params);
}

@end

#pragma mark - ObsidianVideo (Paper view manager via the Fabric interop layer)

RCT_EXTERN_MODULE(ObsidianVideoManager, RCTViewManager)

RCT_EXTERN_METHOD(play : (nonnull NSNumber *)reactTag)
RCT_EXTERN_METHOD(pause : (nonnull NSNumber *)reactTag)
RCT_EXTERN_METHOD(stop : (nonnull NSNumber *)reactTag)
RCT_EXTERN_METHOD(seek : (nonnull NSNumber *)reactTag seconds : (nonnull NSNumber *)seconds)
RCT_EXTERN_METHOD(setRate : (nonnull NSNumber *)reactTag rate : (nonnull NSNumber *)rate)
RCT_EXTERN_METHOD(setVolume : (nonnull NSNumber *)reactTag volume : (nonnull NSNumber *)volume)
RCT_EXTERN_METHOD(setMuted : (nonnull NSNumber *)reactTag muted : (BOOL)muted)
RCT_EXTERN_METHOD(setResizeMode : (nonnull NSNumber *)reactTag mode : (nonnull NSString *)mode)

#pragma mark - Fabric interop allowlist

@implementation RCTLegacyViewManagerInteropComponentView (ObsidianMediaPlayer)

+ (void)load
{
  // `RCTComponentViewFactory.registerComponentIfPossible:` only falls through
  // to the Paper interop layer when `-isSupported:` returns YES, and that
  // method checks a hardcoded allowlist in RCTLegacyViewManagerInteropComponentView
  // (DatePicker, ProgressView, ARTSurfaceView, …). Ours is not on it, so
  // without this opt-in <ObsidianVideo> resolves to
  // RCTUnimplementedViewComponentView and renders nothing: no exception, no
  // log line, just empty space. Must run before the first component is
  // registered, which is what +load guarantees.
  [self supportLegacyViewManagerWithName:@"ObsidianVideo"];
}

@end
