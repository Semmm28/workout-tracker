import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'm'))?.[1] || '';
}

test('app shell fills the standalone viewport without page scrolling', () => {
  const shell = rule('.app-shell');
  assert.match(shell, /position:\s*fixed/);
  assert.match(shell, /inset:\s*0/);
  assert.match(shell, /overflow:\s*hidden/);
  assert.match(shell, /background-color:\s*var\(--page-bottom\)/);
  assert.match(rule('html,\nbody'), /background-color:\s*var\(--page-bottom\)/);
});

test('workout content uses the same available width as the bottom navigation', () => {
  assert.match(rule('.phone-frame'), /width:\s*100%/);
  assert.match(rule('.screen-scroll'), /padding:\s*4px\s+0\s+calc\(103px\s*\+\s*var\(--nav-bottom-gap\)\)/);
});

test('content scrolls behind the pinned foreground navigation', () => {
  const app = rule('.app');
  const scroll = rule('.screen-scroll');
  const navigation = rule('.bottom-nav-shell');
  const bar = rule('.bottom-nav');

  assert.match(app, /padding:\s*calc\(16px\s*\+\s*var\(--safe-top\)\)\s+calc\(16px\s*\+\s*var\(--safe-right\)\)\s+0\s+calc\(16px\s*\+\s*var\(--safe-left\)\)/);
  assert.match(navigation, /position:\s*fixed/);
  assert.match(navigation, /bottom:\s*var\(--nav-bottom-gap\)/);
  assert.match(navigation, /padding-bottom:\s*0/);
  assert.match(navigation, /z-index:\s*20/);
  assert.match(navigation, /pointer-events:\s*none/);
  assert.match(bar, /pointer-events:\s*auto/);
  assert.match(bar, /backdrop-filter:\s*saturate\(150%\)\s+blur\(22px\)/);
  assert.match(scroll, /overflow-y:\s*auto/);
  assert.match(scroll, /scroll-padding-bottom:\s*calc\(103px\s*\+\s*var\(--nav-bottom-gap\)\)/);
});

test('overlays remain above the foreground navigation', () => {
  assert.match(
    css,
    /\.modal-backdrop,\s*\.sheet-backdrop,\s*\.toast-layer\s*\{[^}]*z-index:\s*30/s,
  );
});
