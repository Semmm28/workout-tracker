import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(resolve(root, 'capacitor.config.json'), 'utf8'));
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (!/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(config.appId)) {
  throw new Error('Use an explicit reverse-domain Bundle ID in capacitor.config.json.');
}
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a numeric x.y.z app version.');

const path = resolve(root, 'ios/App/App.xcodeproj/project.pbxproj');
let project = await readFile(path, 'utf8');
project = project.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${config.appId};`);
project = project.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
// The first release targets iOS 16 and later.
project = project.replace(/IPHONEOS_DEPLOYMENT_TARGET = [^;]+;/g, 'IPHONEOS_DEPLOYMENT_TARGET = 16.0;');
// Start with iPhone support; iPad remains available in compatibility mode.
project = project.replace(/TARGETED_DEVICE_FAMILY = [^;]+;/g, 'TARGETED_DEVICE_FAMILY = 1;');
if (process.env.PROJECT_BUILD_NUMBER !== undefined) {
  const number = Number(process.env.PROJECT_BUILD_NUMBER);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid PROJECT_BUILD_NUMBER.');
  // Codemagic's project-wide counter also covers builds from other workflows.
  project = project.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${number + 1};`);
}
await writeFile(path, project);
console.log(`Prepared ${config.appId}, version ${version}.`);
