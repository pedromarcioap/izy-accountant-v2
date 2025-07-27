module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': '/app/backend/node_modules/ts-jest/preprocessor.js',
  },
};
