module.exports = {
  preset: 'react-native',
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: ['node_modules/(?!(react-native|@react-native)/)'],
};
