const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterAllArtifactBuild(buildResult) {
  const dmgFiles = buildResult.artifactPaths.filter((f) => f.endsWith('.dmg'));

  for (const dmg of dmgFiles) {
    const name = path.basename(dmg);

    // Sign the DMG
    console.log(`Signing ${name}...`);
    execFileSync('codesign', [
      '--force',
      '--sign',
      'Developer ID Application: Timothé PORTERIE (YPBYF7PQP2)',
      dmg,
    ], { stdio: 'inherit' });

    // Staple notarization ticket to the DMG
    console.log(`Stapling ${name}...`);
    try {
      execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });
    } catch (e) {
      console.warn(`Stapling failed for ${name} (ticket may not be available yet)`);
    }
  }

  return dmgFiles;
};
