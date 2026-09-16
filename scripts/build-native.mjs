import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
// Only clear this script's own generated output, never a caller-provided path.
if (dirname(output) !== root || output !== join(root, 'dist')) {
  throw new Error('Unexpected build output directory');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'styles.css', 'assets']) {
  await cp(join(root, name), join(output, name), { recursive: true });
}
const html = await readFile(join(output, 'index.html'), 'utf8');
await writeFile(join(output, 'index.html'), html.replace(/^\s*<link rel="manifest"[^>]+>\r?\n/m, ''));
await build({
  absWorkingDir: root,
  entryPoints: ['native/entry.js'],
  outfile: join(output, 'app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'safari15.4',
  minify: true,
  legalComments: 'eof',
});
console.log('Native web bundle created in dist/ (the original PWA files are untouched).');
