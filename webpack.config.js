const path = require('path');

// webpack config to prevent build errors in sora-js-sdk/dist
module.exports = {
  resolve: {
    fallback: {
      "os": require.resolve("os-browserify/browser"),
    },
    alias: {
      "fs": false,
    },
  },
};
