# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# CMake build for obsidian-media-player (ObsidianMediaPlayerSpec).
#
# The `react_codegen_ObsidianMediaPlayerSpec` target is produced by React Native
# Codegen from `src/specs/*` (see `codegenConfig` in package.json) into:
#   android/build/generated/source/codegen/jni/
# That directory only exists when the build runs with the New Architecture
# enabled AND the `com.facebook.react` Gradle plugin has executed Codegen.
# The `if(EXISTS ...)` guards below are intentional: without them, Old
# Architecture builds (or a stale checkout where Codegen has not run yet)
# fail the whole app build with:
#   "add_subdirectory given source .../codegen/jni which is not an existing
#    directory" / "Cannot specify link libraries for target
#    react_codegen_ObsidianMediaPlayerSpec".
# Do NOT "fix" a Codegen problem by creating that directory by hand — an empty
# directory still leaves the `react_codegen_ObsidianMediaPlayerSpec` target
# undefined and the link step fails. Fix the Codegen wiring instead.

cmake_minimum_required(VERSION 3.13)

set(CMAKE_VERBOSE_MAKEFILE on)

# C++20, and set ONCE, here.
#
# React Native 0.74's Android headers require it. The prefab modules we compile
# against use C++20-only constructs — `concept` in
# react_nativemodule_core/react/renderer/core/RawProps.h, `std::bit_width` in
# yoga/enums/YogaEnums.h, `std::identity` in react/utils/fnv1a.h — so any
# translation unit that includes them has to be compiled as C++20. RN's own C++
# agrees: ReactCommon/yoga/cmake/project-defaults.cmake sets 20.
#
# This was 17, and it was the *last* `-std=` on every compile line, because
# CMake appends the flag it derives from CXX_STANDARD after every
# target_compile_options entry. That silently overrode the `-std=c++20` the
# generated codegen CMakeLists asks for, so both targets failed:
#
#   error: unknown type name 'concept'
#   error: no member named 'bit_width' in namespace 'std'
#   error: no type named 'identity' in namespace 'std'
#
# The moral, and the reason there is exactly one authority for the standard:
# three files set it (this property, a hand-written `-std=` in
# target_compile_options below, and `cppFlags` in ../build.gradle) and CMake's
# flag won purely by being last. The other two are removed rather than bumped —
# keeping a second, earlier `-std=` re-creates the same ordering trap the next
# time someone edits one of the three.
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# CXX_EXTENSIONS defaults to ON, which makes CMake emit `-std=gnu++20`. That is
# what RN compiles with; left explicit so the spelling is not an accident.
set(CMAKE_CXX_EXTENSIONS ON)

project(ObsidianMediaPlayerSpec)

# These two are resolved through AGP's prefab mechanism. Unlike an app module,
# a `com.android.library` module gets nothing injected for it by
# `react-native-gradle-plugin` (it only sets `prefab = true` and passes
# `-DREACT_ANDROID_DIR` for `com.android.application`), so the library itself
# must declare `buildFeatures { prefab = true }` in its build.gradle. ReactAndroid
# publishes the prefab packages (see node_modules/react-native/ReactAndroid/
# build.gradle -> `buildFeatures { prefab true }`); fbjni arrives transitively
# through react-android's `api` dependency.
#
# If this ever fails with
#   "Could not find a package configuration file provided by ReactAndroid"
# the cause is a missing `prefab = true` in ../build.gradle, not this file.
find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

add_library(
  ${CMAKE_PROJECT_NAME}
  SHARED
  src/main/jni/OnLoad.cpp
)

target_include_directories(
  ${CMAKE_PROJECT_NAME}
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src/main/jni
)

# `-Werror` is opt-in. The host pins a single NDK revision, but the app itself
# may move it, and a JNI shim that only does `JNI_OnLoad` is not worth failing
# a release build over. Opt in with -DOMP_ENABLE_WERROR=ON in a local build or
# in CI when you want the strict pass.
option(OMP_ENABLE_WERROR "Treat C/C++ warnings as errors" OFF)

target_compile_options(
  ${CMAKE_PROJECT_NAME}
  PRIVATE
    -fexceptions
    -frtti
    # No -std= here on purpose — CMake owns it via CMAKE_CXX_STANDARD above, so
    # there is exactly one source for the standard. See the comment there.
    -Wall
    -Wextra
    -Wno-unused-parameter
)

if(OMP_ENABLE_WERROR)
  target_compile_options(${CMAKE_PROJECT_NAME} PRIVATE -Werror)
endif()

target_link_libraries(
  ${CMAKE_PROJECT_NAME}
  fbjni::fbjni
  ReactAndroid::jsi
  ReactAndroid::fabricjni
  ReactAndroid::folly_runtime
  ReactAndroid::glog
  ReactAndroid::react_nativemodule_core
  ReactAndroid::react_render_core
  ReactAndroid::react_render_componentregistry
  ReactAndroid::rrc_view
  ReactAndroid::turbomodulejsijni
  ReactAndroid::yoga
)

# Folly's compile flags, which must MATCH the ones react-android compiled its own
# copy of Folly with. RN publishes them from
# `scripts/cocoapods/helpers.rb` -> `Helpers::Constants.folly_config`:
#
#   '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1
#    -DFOLLY_CFG_NO_COROUTINES=1 -DFOLLY_HAVE_CLOCK_GETTIME=1
#    -Wno-comma -Wno-shorten-64-to-32'
#
# Without at least `-DFOLLY_NO_CONFIG`, `folly/portability/Config.h` does
# `#include <folly/folly-config.h>` — and that header is shipped by NO prefab
# module (verified against the react-android AAR's prefab/modules listing:
# folly_runtime ships `folly/portability/Config.h` but not `folly/folly-config.h`,
# which only exists in a Folly source build). So the build dies with:
#
#   fatal error: 'folly/folly-config.h' file not found
#
# The other flags are not optional decoration: they are ABI switches. A
# translation unit that sees a different FOLLY_MOBILE / FOLLY_USE_LIBCPP than
# the react-android .so it links against gets a different struct layout or
# calling convention, which is a silent, runtime-only corruption. That is why
# they are copied from RN's own list rather than guessed.
target_compile_options(
  ${CMAKE_PROJECT_NAME}
  PRIVATE
    -DFOLLY_NO_CONFIG
    -DFOLLY_MOBILE=1
    -DFOLLY_USE_LIBCPP=1
    -DFOLLY_CFG_NO_COROUTINES=1
    -DFOLLY_HAVE_CLOCK_GETTIME=1
    -Wno-comma
    -Wno-shorten-64-to-32
)

# Fabric component descriptors generated from src/specs/NativeObsidianVideo.ts.
# Guarded so Paper / Old Architecture builds keep working when Codegen has not
# produced output (e.g. newArchEnabled=false).
set(CODEGEN_JNI_DIR ${CMAKE_CURRENT_SOURCE_DIR}/build/generated/source/codegen/jni)
# Quoted: the checkout path can legitimately contain spaces (e.g. a Windows
# "C:\Users\<First Last>\..." checkout), which would otherwise split into
# multiple arguments and produce a confusing "not an existing directory" error.
if(EXISTS "${CODEGEN_JNI_DIR}/CMakeLists.txt")
  add_subdirectory("${CODEGEN_JNI_DIR}" codegen_ObsidianMediaPlayerSpec_build)

  # THE GENERATED CMakeLists LINKS ITS PREFAB DEPENDENCIES BY *BARE* NAME.
  #
  # @react-native/codegen's GenerateModuleJniH.js emits:
  #
  #   target_link_libraries(react_codegen_ObsidianMediaPlayerSpec
  #     fbjni folly_runtime glog jsi react_codegen_rncore react_debug
  #     react_nativemodule_core ... rrc_view turbomodulejsijni yoga)
  #
  # None of those are the imported targets AGP's prefab actually creates. It
  # creates `ReactAndroid::<module>` for react-android and `fbjni::fbjni` for
  # fbjni. A bare `rrc_view` is not a target, so CMake treats it as a raw name
  # to hand to the linker and — critically — adds NO include directories for it.
  #
  # The symptom is that the generated sources cannot find any React header,
  # while the hand-written sources compile fine in the same build:
  #
  #   fatal error: 'ReactCommon/TurboModule.h' file not found          (JSI gen)
  #   fatal error: 'ReactCommon/JavaTurboModule.h' file not found
  #   fatal error: 'react/renderer/components/view/ViewProps.h' file not found
  #   fatal error: 'react/renderer/components/view/ViewEventEmitter.h' file not found
  #
  # In the failing CI log, the clang++ line for OnLoad.cpp carries a long list of
  # `-isystem .../prefab/modules/...` arguments while the four codegen lines carry
  # none. Same project, same find_package, two link styles, two different
  # outcomes — which is what identified the bare-name targets as the cause.
  #
  # So: link the namespaced form here, one-for-one with what the generated file
  # asked for.
  target_link_libraries(react_codegen_ObsidianMediaPlayerSpec
    fbjni::fbjni
    ReactAndroid::folly_runtime
    ReactAndroid::glog
    ReactAndroid::jsi
    ReactAndroid::react_codegen_rncore
    ReactAndroid::react_debug
    ReactAndroid::react_nativemodule_core
    ReactAndroid::react_render_componentregistry
    ReactAndroid::react_render_core
    ReactAndroid::react_render_debug
    ReactAndroid::react_render_graphics
    ReactAndroid::react_render_imagemanager
    ReactAndroid::react_render_mapbuffer
    ReactAndroid::react_utils
    ReactAndroid::rrc_image
    ReactAndroid::rrc_view
    ReactAndroid::turbomodulejsijni
    ReactAndroid::yoga
  )

  # The generated sources also include Folly headers (through
  # ComponentDescriptor.h -> EventDispatcher.h -> folly/dynamic.h), so they need
  # the same FOLLY_* defines as the target above.
  target_compile_options(react_codegen_ObsidianMediaPlayerSpec
    PRIVATE
      -DFOLLY_NO_CONFIG
      -DFOLLY_MOBILE=1
      -DFOLLY_USE_LIBCPP=1
      -DFOLLY_CFG_NO_COROUTINES=1
      -DFOLLY_HAVE_CLOCK_GETTIME=1
      -Wno-comma
      -Wno-shorten-64-to-32
  )

  # NOW DROP THE BARE NAMES. Adding the namespaced targets above fixed the
  # *compile* step, but CMake MERGES successive target_link_libraries calls
  # rather than replacing them, so the generated file's bare names were still on
  # the link line and the build failed one step later, at the link:
  #
  #   ld.lld: error: unable to find library -lfbjni
  #   ld.lld: error: unable to find library -lfolly_runtime
  #   ... one per bare name ...
  #
  # The link line shows both groups, which is the whole diagnosis:
  #
  #   -lfbjni -lfolly_runtime -lglog ... -lyoga      <- bare, from the generated file
  #   /home/runner/.../libfbjni.so /home/runner/.../libfolly_runtime.so ...
  #                                                 <- correct, from the namespaced targets
  #
  # A bare `folly_runtime` is not a target and not a path, so CMake emits
  # `-lfolly_runtime`, and the linker has no `-L` pointing at the prefab
  # `libs/android.arm64-v8a` directories (this is a library module consuming
  # react-android as a dependency, not the app that AGP configures directly).
  #
  # So rewrite LINK_LIBRARIES, keeping only entries that are real targets or
  # absolute paths. Must run AFTER the target_link_libraries above, or the
  # namespaced entries it keeps are not in the list yet. CMake offers no way to
  # remove entries from the property, so the property is replaced wholesale.
  get_target_property(_omp_gen_links react_codegen_ObsidianMediaPlayerSpec LINK_LIBRARIES)
  set(_omp_kept "")
  set(_omp_dropped "")
  foreach(_omp_lib IN LISTS _omp_gen_links)
    if(TARGET "${_omp_lib}" OR IS_ABSOLUTE "${_omp_lib}")
      list(APPEND _omp_kept "${_omp_lib}")
    else()
      list(APPEND _omp_dropped "${_omp_lib}")
    endif()
  endforeach()
  if(_omp_dropped)
    message(STATUS
      "obsidian-media-player: dropped ${_omp_dropped} from the generated codegen "
      "target's link line; they are not resolvable targets and became -l flags "
      "the linker could not find. The namespaced equivalents above are linked "
      "instead.")
    set_property(TARGET react_codegen_ObsidianMediaPlayerSpec
      PROPERTY LINK_LIBRARIES ${_omp_kept})
  endif()

  target_link_libraries(${CMAKE_PROJECT_NAME} react_codegen_ObsidianMediaPlayerSpec)
endif()
