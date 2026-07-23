import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const pwa = await readFile(new URL('../js/pwa.js', import.meta.url), 'utf8');

test('iOS standalone mode can paint into the safe areas', () => {
  assert.match(index, /name="viewport"[^>]*viewport-fit=cover/);
  assert.match(index, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(index, /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
});

test('standalone layout uses the WebKit full-height fallback', async () => {
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  const standalone = css.match(/@media all and \(display-mode: standalone\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(standalone, /html,\s*body,\s*\.app-shell\s*\{/);
  assert.match(standalone, /min-height:\s*100vh/);
  assert.doesNotMatch(standalone, /100(?:d|s|l)vh|-webkit-fill-available/);
});

test('browser and launch surfaces match the page bottom color', () => {
  assert.match(index, /name="theme-color" content="#090a0d"/);
  assert.equal(manifest.background_color, '#090a0d');
  assert.equal(manifest.theme_color, '#090a0d');
  assert.equal(manifest.display, 'standalone');
});

test('visual viewport changes keep the set modal above the iOS keyboard', () => {
  assert.match(app, /setupVisualViewportTracking\(\)/);
  assert.match(pwa, /window\.visualViewport/);
  assert.match(pwa, /--visual-viewport-height/);
  assert.match(pwa, /--visual-viewport-offset-top/);
  assert.match(pwa, /viewport\?\.addEventListener\('resize'/);
  assert.match(pwa, /viewport\?\.addEventListener\('scroll'/);
});
