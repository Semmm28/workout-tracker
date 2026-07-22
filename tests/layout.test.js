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
});

test('workout content uses the same available width as the bottom navigation', () => {
  assert.match(rule('.phone-frame'), /width:\s*100%/);
  assert.match(rule('.screen-scroll'), /padding:\s*4px\s+0\s+12px/);
});

test('bottom navigation stays pinned while only screen content scrolls', () => {
  const navigation = rule('.bottom-nav-shell');
  assert.match(navigation, /position:\s*fixed/);
  assert.match(navigation, /bottom:\s*0/);
  assert.match(rule('.screen-scroll'), /overflow-y:\s*auto/);
});
