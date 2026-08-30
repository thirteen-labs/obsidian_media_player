const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const config = {
  watchFolders: ['..'],
  resolver: {
    blockList: [],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
