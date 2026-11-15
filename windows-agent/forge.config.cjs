const path = require('path');

module.exports = {
  rebuildConfig: {
    buildPath: path.resolve(__dirname, './'),
    onlyModules: [],
  },
  outDir: 'out/v0.1.4',
  packagerConfig: { asar: true, executableName: 'UrQrPrintAgent', appBundleId: 'in.co.urqrprint.agent', icon: path.join(__dirname, 'assets', 'urqrprint-icon.ico') },
  makers: [{ name: '@electron-forge/maker-squirrel', config: { name: 'UrQrPrintAgent', authors: 'UrQrPrint', description: 'UrQrPrint Windows printer agent', setupIcon: path.join(__dirname, 'assets', 'urqrprint-icon.ico'), loadingGif: path.join(__dirname, 'assets', 'installer-loading.gif') } }],
  plugins: [{ name: '@electron-forge/plugin-vite', config: {
    build: [
      { entry: 'src/main.ts', config: 'vite.main.config.ts' },
      { entry: 'src/preload.ts', config: 'vite.preload.config.ts' },
    ],
    renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
  } }],
};
