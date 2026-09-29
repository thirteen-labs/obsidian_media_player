module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: ['node_modules/(?!(react-native|@react-native)/)'],
  // react-native's preset maps `^.+\.(js|ts|tsx)$` to babel-jest, which does
  // not include `.mjs`. The CI helpers under scripts/ci/ are plain ESM and are
  // imported straight into their tests, so without this they reach the CJS
  // runtime as an untransformed `export` token:
  //   "Jest encountered an unexpected token ... SyntaxError: Unexpected token 'export'"
  // Overriding `transform` replaces the preset's map rather than adding to it,
  // so the whole set is spelled out here.
  transform: {
    '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$': 'babel-jest',
  },
};
