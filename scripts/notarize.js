const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appName}...`);

  const options = { appPath };

  if (process.env.APPLE_API_KEY) {
    // CI: use App Store Connect API Key
    options.appleApiKey = process.env.APPLE_API_KEY;
    options.appleApiKeyId = process.env.APPLE_API_KEY_ID;
    options.appleApiIssuer = process.env.APPLE_API_ISSUER;
    console.log('Using API Key authentication (CI)');
  } else {
    // Local: use keychain profile
    options.keychainProfile = 'claude-bar-notarize-apikey';
    console.log('Using keychain profile (local)');
  }

  await notarize(options);

  console.log('Notarization complete.');
};
