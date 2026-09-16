import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const config = JSON.parse(await read('capacitor.config.json'));
const workflows = parse(await read('codemagic.yaml')).workflows;
const project = await read('ios/App/App.xcodeproj/project.pbxproj');
const info = await read('ios/App/App/Info.plist');
const privacy = await read('ios/App/App/PrivacyInfo.xcprivacy');
const scheme = await read('ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme');
const swiftPackage = await read('ios/App/CapApp-SPM/Package.swift');

assert.equal(config.webDir, 'dist');
assert.ok(!config.server?.url, 'Production builds must load bundled assets, not a hosted URL.');
assert.equal(workflows['ios-testflight'].environment.ios_signing.bundle_identifier, config.appId);
assert.equal(workflows['ios-testflight'].environment.ios_signing.distribution_type, 'app_store');
const ids = [...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((match) => match[1]);
assert.equal(ids.length, 2, 'Both Debug and Release need a Bundle ID.');
assert.ok(ids.every((id) => id === config.appId), 'Xcode and Capacitor Bundle IDs must match.');
assert.match(scheme, /BlueprintIdentifier="504EC3031FED79650016851F"/);
assert.match(project, /PrivacyInfo\.xcprivacy in Resources/);
assert.match(privacy, /NSPrivacyAccessedAPICategoryFileTimestamp/);
assert.match(privacy, /C617\.1/);
assert.match(info, /ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
assert.match(swiftPackage, /CapacitorFilesystem/);
assert.match(swiftPackage, /CapacitorShare/);
assert.ok(!swiftPackage.includes('C:\\'), 'Native dependencies must use portable paths.');
assert.ok(!workflows['ios-check'].integrations, 'The check workflow must work without Apple credentials.');
assert.ok(!workflows['ios-check'].environment.ios_signing);
assert.equal(workflows['ios-testflight'].publishing.app_store_connect.submit_to_app_store, false);
for (const workflow of Object.values(workflows)) {
  assert.ok(!workflow.triggering, 'Builds are manual until explicitly enabled.');
}
for (const filename of ['index.html', 'app.js', 'styles.css', 'assets/icon-512.png']) {
  assert.ok((await readFile(resolve(root, 'dist', filename))).length > 0, `Missing bundled asset: ${filename}`);
}
const icon = await readFile(resolve(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
assert.equal(icon.readUInt32BE(16), 1024, 'iOS app icon must be 1024 pixels wide.');
assert.equal(icon.readUInt32BE(20), 1024, 'iOS app icon must be 1024 pixels high.');
assert.equal(icon[25], 2, 'The App Store icon must be RGB without an alpha channel.');
console.log('iOS configuration, workflows, bundled assets and app icon validated.');
