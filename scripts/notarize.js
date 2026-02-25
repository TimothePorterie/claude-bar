const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  if (process.env.APPLE_ID) {
    // CI: use environment variables
    console.log(`Notarizing ${appName} (CI)...`);
    await notarize({
      appBundleId: 'com.claude-bar.app',
      appPath,
      tool: 'notarytool',
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });
  } else {
    // Local: use stored keychain profile
    console.log(`Notarizing ${appName} (local)...`);
    await notarize({
      appBundleId: 'com.claude-bar.app',
      appPath,
      tool: 'notarytool',
      keychainProfile: 'claude-bar-notarize',
    });
  }

  console.log('Notarization complete.');
};
