const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const options = { appPath };

  if (process.env.APPLE_ID) {
    console.log(`Notarizing ${appName} (CI)...`);
    options.appleId = process.env.APPLE_ID;
    options.appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
    options.teamId = process.env.APPLE_TEAM_ID;
  } else {
    console.log(`Notarizing ${appName} (local)...`);
    options.keychainProfile = 'claude-bar-notarize';
  }

  try {
    await notarize(options);
    console.log(`Notarization complete for ${appName}.`);
  } catch (error) {
    console.error('Notarization failed:', error.message || error);
    throw error;
  }
};
