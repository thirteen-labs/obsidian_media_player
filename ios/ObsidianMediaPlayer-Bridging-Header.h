// Bridging header for the ObsidianMediaPlayer pod.
//
// Only plain Objective-C React headers belong here. A bridging header is
// parsed as Objective-C, never Objective-C++, so it cannot import the codegen
// output — `ObsidianMediaPlayerSpec.h` opens with
// `#ifndef __cplusplus / #error This file must be compiled as Obj-C++`, and
// importing it here failed the build before Wave 3.
//
// The generated spec is imported from ObsidianMediaPlayerModules.mm instead,
// which is the only place that needs it. `RCTViewComponentView.h` is gone for
// the same reason: there is no Fabric component view class in this pod, since
// <ObsidianVideo> renders through the legacy-view-manager interop layer.
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTViewManager.h>
