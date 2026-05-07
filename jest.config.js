module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|react-native-fs|react-native-sound|react-native-svg|react-native-document-picker|@react-navigation|react-native-safe-area-context)/)',
  ],
  moduleNameMapper: {
    '^react-native-fs$': '<rootDir>/__mocks__/react-native-fs.js',
    '^react-native-sound$': '<rootDir>/__mocks__/react-native-sound.js',
  },
};
