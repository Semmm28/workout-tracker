import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

test('iOS standalone mode can paint into the safe areas', () => {
  assert.match(index, /name="viewport"[^>]*viewport-fit=cover/);
  assert.match(index, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(index, /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
});

test('browser and launch surfaces match the page bottom color', () => {
  assert.match(index, /name="theme-color" content="#090a0d"/);
  assert.equal(manifest.background_color, '#090a0d');
  assert.equal(manifest.theme_color, '#090a0d');
  assert.equal(manifest.display, 'standalone');
});
