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
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

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
    -std=c++17
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
  ReactAndroid::react_nativemodule_core
  ReactAndroid::react_render_core
  ReactAndroid::react_render_componentregistry
  ReactAndroid::rrc_view
)

# Fabric component descriptors generated from src/specs/NativeObsidianVideo.ts.
# Guarded so Paper / Old Architecture builds keep working when Codegen has not
# produced output (e.g. newArchEnabled=false).
set(CODEGEN_JNI_DIR ${CMAKE_CURRENT_SOURCE_DIR}/build/generated/source/codegen/jni)
# Quoted: the checkout path can legitimately contain spaces (e.g. a Windows
# "C:\Users\<First Last>\..." checkout), which would otherwise split into
# multiple arguments and produce a confusing "not an existing directory" error.
if(EXISTS "${CODEGEN_JNI_DIR}/CMakeLists.txt")
  # The generated target declares its own INTERFACE include directories, so
  # linking is sufficient — no manual target_include_directories needed.
  add_subdirectory("${CODEGEN_JNI_DIR}" codegen_ObsidianMediaPlayerSpec_build)
  target_link_libraries(${CMAKE_PROJECT_NAME} react_codegen_ObsidianMediaPlayerSpec)
endif()
