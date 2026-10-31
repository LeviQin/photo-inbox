const fs = require('node:fs');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const realProjectRoot = fs.realpathSync.native(__dirname);

if (realProjectRoot !== __dirname) {
  config.watchFolders = [...(config.watchFolders ?? []), realProjectRoot];
}

config.resolver.assetExts.push('wasm');

module.exports = config;
