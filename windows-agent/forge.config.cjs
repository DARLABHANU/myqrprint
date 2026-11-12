const path = require('path');

module.exports = {
  rebuildConfig: {
    buildPath: path.resolve(__dirname, './'),
    onlyModules: [],
  },
  outDir: 'out/v0.1.1',
  packagerConfig: { asar: true, executableName: 'PrintlyAgent', appBundleId: 'in.co.printly.agent' },
  makers: [{ name: '@electron-forge/maker-squirrel', config: { name: 'PrintlyAgent', authors: 'Printly', description: 'Printly Windows printer agent' } }],
  plugins: [{ name: '@electron-forge/plugin-vite', config: {
    build: [
      { entry: 'src/main.ts', config: 'vite.main.config.ts' },
      { entry: 'src/preload.ts', config: 'vite.preload.config.ts' },
    ],
    renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
  } }],
};
