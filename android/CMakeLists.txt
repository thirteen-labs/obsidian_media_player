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

# Remove every entry from a target's link properties that CMake cannot resolve —
# anything that is neither a real target nor an absolute path. See the long
# comment at the call site for why *both* properties have to be swept, and why
# that is the whole difference between a link line CMake can satisfy and 18
# `unable to find library` errors.
function(omp_prune_unresolvable_link_entries _target)
  set(_dropped_all "")
  foreach(_prop IN ITEMS LINK_LIBRARIES INTERFACE_LINK_LIBRARIES)
    # An unset property reads back as "<name>-NOTFOUND", which is a CMake false
    # constant, so this also covers LINK_LIBRARIES being absent — which is the
    # case for an OBJECT library, and RN >= 0.76 generates an OBJECT codegen
    # target where RN 0.74 generated a SHARED one.
    get_target_property(_entries ${_target} ${_prop})
    if(NOT _entries)
      continue()
    endif()
    set(_kept "")
    set(_dropped "")
    foreach(_entry IN LISTS _entries)
      # An entry the plain signature propagates, or one a keyword signature
      # marked link-only, can arrive wrapped in $<LINK_ONLY:...>. Unwrap only to
      # decide resolvability; a resolvable entry is kept verbatim so nothing
      # about how it was declared changes.
      string(REGEX REPLACE "^\\$<LINK_ONLY:(.*)>$" "\\1" _name "${_entry}")
      if(TARGET "${_name}" OR IS_ABSOLUTE "${_name}")
        list(APPEND _kept "${_entry}")
      else()
        list(APPEND _dropped "${_name}")
      endif()
    endforeach()
    if(_dropped)
      set_property(TARGET ${_target} PROPERTY ${_prop} ${_kept})
      list(APPEND _dropped_all ${_dropped})
    endif()
  endforeach()
  if(_dropped_all)
    list(REMOVE_DUPLICATES _dropped_all)
    string(REPLACE ";" ", " _pretty "${_dropped_all}")
    message(STATUS
      "obsidian-media-player: dropped unresolvable link entries from ${_target}: "
      "${_pretty}. The namespaced prefab targets linked alongside are used instead.")
  endif()
endfunction()

# The companion guard: fail at configure time rather than at link time. A
# message(STATUS) is not enough, because AGP does not relay CMake's configure
# output at the default log level — a `configureCMakeRelWithDebInfo` step in a
# CI log shows the `[CXX5304]` warnings and nothing else. That invisibility is
# part of why the LINK_LIBRARIES-only version of this fix read as a fix: it
# printed a reassuring STATUS line that no run ever showed, while the build
# stayed red for a different reason. FATAL_ERROR does surface, and
# scripts/ci/verify-android-host.mjs keeps `obsidian-media-player:` in the
# failure digest it prints.
function(omp_assert_link_entries_resolvable _target)
  foreach(_prop IN ITEMS LINK_LIBRARIES INTERFACE_LINK_LIBRARIES)
    get_target_property(_entries ${_target} ${_prop})
    if(NOT _entries)
      continue()
    endif()
    set(_bad "")
    foreach(_entry IN LISTS _entries)
      string(REGEX REPLACE "^\\$<LINK_ONLY:(.*)>$" "\\1" _name "${_entry}")
      if(NOT TARGET "${_name}" AND NOT IS_ABSOLUTE "${_name}")
        list(APPEND _bad "${_name}")
      endif()
    endforeach()
    if(_bad)
      list(REMOVE_DUPLICATES _bad)
      string(REPLACE ";" ", " _pretty "${_bad}")
      message(FATAL_ERROR
        "obsidian-media-player: ${_target} still has unresolvable entries in "
        "${_prop}: ${_pretty}. These reach the linker as -l<name> and fail with "
        "\"unable to find library\", because this is a library module consuming "
        "react-android as a dependency rather than the app AGP configures "
        "directly, so no -L points at the prefab directories. Add the matching "
        "ReactAndroid:: / fbjni:: target to the target_link_libraries call above.")
    endif()
  endforeach()
endfunction()

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
  # THE GENERATED CMakeLists CALLS A REACT NATIVE MACRO THAT NOTHING HERE DEFINES.
  #
  # @react-native/codegen's GenerateModuleJniH.js emits, as the last statement of
  # the file it writes to jni/CMakeLists.txt (line 79 of the template, which lands
  # on line 28 of the generated file):
  #
  #   target_compile_reactnative_options(react_codegen_<Name> PRIVATE)
  #
  # That macro has exactly one definition in React Native:
  #
  #   ReactCommon/cmake-utils/react-native-flags.cmake:29
  #     function(target_compile_reactnative_options target_name scope)
  #
  # and exactly one place that includes it:
  #
  #   ReactAndroid/cmake-utils/ReactNative-application.cmake:25
  #     include(${REACT_COMMON_DIR}/cmake-utils/react-native-flags.cmake)
  #
  # ReactNative-application.cmake is the *app target* helper. A stock RN app gets
  # the macro because its android/app/src/main/jni/CMakeLists.txt includes that
  # file. This module does not and should not: it is a com.android.library, and
  # because it declares its own
  #
  #   externalNativeBuild { cmake { path "CMakeLists.txt" } }
  #
  # AGP configures it as a SEPARATE CMake project with its own scope. The app's
  # include() is not inherited across that boundary, so the macro the generated
  # file needs simply is not defined here, and configure dies before the compiler
  # ever runs:
  #
  #   CMake Error at build/generated/source/codegen/jni/CMakeLists.txt:28:
  #   Unknown CMake command "target_compile_reactnative_options".
  #
  # This is latent locally and fatal in an app, which is why it survived. The
  # add_subdirectory below is guarded on the codegen output existing, and codegen
  # only produces it for this module during an app build (see the `react { }`
  # block in ../build.gradle) — so `gradle :obsidian-media-player:assemble` in
  # this repo skips the whole branch and passes, while every consuming app with
  # the New Architecture enabled takes it.
  #
  # This is NOT an RN version mismatch, which is the natural reading of that
  # error and worth stating plainly: both halves ship in the same react-native.
  # The caller is @react-native/codegen and the callee is ReactCommon/, and they
  # are pinned together; nothing here is asking for a newer macro than the RN on
  # the machine provides.
  #
  # Include is skipped when the macro already exists, so an app that pulls RN's
  # application-level helper in first is unaffected, and so are future RN versions
  # that fold this into some other file we are already including.
  if(NOT COMMAND target_compile_reactnative_options)
    # Resolved through `node`, like ObsidianMediaPlayer.podspec does on iOS, and
    # for the same reason: react-native is a *sibling* of this library in a
    # consuming app, not a child of it, so a relative ../node_modules path only
    # works when the module happens to be built from its own checkout.
    # require.resolve walks up the node_modules chain from here and finds both
    # layouts.
    execute_process(
      COMMAND node --print "require.resolve('react-native/package.json')"
      WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
      OUTPUT_VARIABLE omp_react_native_package_json
      OUTPUT_STRIP_TRAILING_WHITESPACE
      ERROR_QUIET
    )
    if(omp_react_native_package_json)
      get_filename_component(omp_react_native_dir "${omp_react_native_package_json}" DIRECTORY)
      set(omp_rn_flags "${omp_react_native_dir}/ReactCommon/cmake-utils/react-native-flags.cmake")
      # EXISTS, because the peer range is `react-native >=0.74.0` and this file
      # is not in every version of React Native. Including a path that does not
      # exist is itself a fatal CMake error, which would trade one configure
      # failure for another on an older RN. The COMMAND check below then reports
      # the real problem in those versions.
      if(EXISTS "${omp_rn_flags}")
        include("${omp_rn_flags}")
      endif()
    endif()
  endif()
  if(NOT COMMAND target_compile_reactnative_options)
    message(FATAL_ERROR
      "React Native's target_compile_reactnative_options is not defined, but "
      "${CODEGEN_JNI_DIR}/CMakeLists.txt calls it.\n"
      "It is defined in react-native/ReactCommon/cmake-utils/react-native-flags.cmake, "
      "which this file includes when `node --print require.resolve(...)` finds react-native.\n"
      "Check that node is on PATH for this build (node --version) and that react-native "
      "is installed next to or above this module (npm ls react-native)."
    )
  endif()

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

  # NOW DROP THE BARE NAMES — FROM BOTH PROPERTIES.
  #
  # Adding the namespaced targets above fixed the *compile* step, and rewriting
  # LINK_LIBRARIES alone fixed the codegen target's own link step — but the build
  # still failed one step later, in *this* target's link step:
  #
  #   ld.lld: error: unable to find library -lfbjni
  #   ... one per bare name, 18 of them ...
  #
  # The cause is that the generated file uses the PLAIN (legacy)
  # target_link_libraries signature, and the plain signature writes its arguments
  # to *two* properties, not one:
  #
  #   target_link_libraries(react_codegen_... fbjni folly_runtime glog jsi ...)
  #     -> LINK_LIBRARIES           = fbjni;folly_runtime;glog;jsi;...
  #     -> INTERFACE_LINK_LIBRARIES = fbjni;folly_runtime;glog;jsi;...
  #
  # So rewriting only LINK_LIBRARIES left every bare name sitting in
  # INTERFACE_LINK_LIBRARIES, and the plain `target_link_libraries` at the bottom
  # of this file — the one that links the codegen target into this target — is
  # precisely what propagates a linked target's INTERFACE_LINK_LIBRARIES onto
  # the consumer's link line. The failing link line shows both groups, bare
  # first, which is the order the generated file added them:
  #
  #   ... libyoga.so   -lfbjni -lfolly_runtime -lglog ... -lyoga
  #        libreact_codegen_rncore.so ... librrc_image.so
  #        ^ bare, inherited via INTERFACE_LINK_LIBRARIES
  #                                 ^ correct, from the namespaced targets
  #
  # A bare `folly_runtime` is neither a target nor a path, so CMake emits
  # `-lfolly_runtime`, and nothing on the line can satisfy it: this is a library
  # module consuming react-android as a dependency, not the app that AGP
  # configures directly, so there is no -L pointing at the prefab
  # libs/android.<abi> directories.
  #
  # So both properties are swept. An entry is kept only if it is a real target or
  # an absolute path; the namespaced equivalents added above stay in its place.
  # Must run AFTER that target_link_libraries, or the entries it keeps are not in
  # the list yet. CMake offers no way to remove an entry from a property, so each
  # property is replaced wholesale.
  omp_prune_unresolvable_link_entries(react_codegen_ObsidianMediaPlayerSpec)

  target_link_libraries(${CMAKE_PROJECT_NAME} react_codegen_ObsidianMediaPlayerSpec)

  omp_assert_link_entries_resolvable(react_codegen_ObsidianMediaPlayerSpec)
  omp_assert_link_entries_resolvable(${CMAKE_PROJECT_NAME})
endif()
