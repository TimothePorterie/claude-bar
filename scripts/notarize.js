// Local-only notarization script (for manual use with afterSign hook).
// CI uses electron-builder's built-in notarize via mac.notarize config.
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appName}...`);

  await notarize({
    appPath,
    keychainProfile: 'claude-bar-notarize',
  });

  console.log('Notarization complete.');
};
