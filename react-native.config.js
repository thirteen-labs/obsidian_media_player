module.exports = {
  dependency: {
    platforms: {
      android: {
        source: {
          android: {
            project: 'android',
            gradle: 'android/build.gradle',
          },
        },
        packageImportPath: 'import com.obsidianmediaplayer.ObsidianMediaPlayerPackage;',
        packageInstance: 'new ObsidianMediaPlayerPackage()',
      },
      ios: {
        podspecPath: 'ios/ObsidianMediaPlayer.podspec',
      },
    },
  },
  assets: [],
};
