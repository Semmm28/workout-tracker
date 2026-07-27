import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const gestures = await readFile(new URL('../js/ui/gestures.js', import.meta.url), 'utf8');

test('set actions toggle by click and support keyboard open and close', () => {
  assert.match(gestures, /row\.addEventListener\('click', onRowClickCapture, true\)/);
  assert.match(gestures, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(gestures, /event\.key !== 'Escape'/);
  assert.match(gestures, /actions\?\.querySelector\('button'\)\?\.focus/);
});

test('gesture handling suppresses accidental clicks and closes on outside click', () => {
  assert.match(gestures, /hasVerticalIntent = true;\s*suppressTrackClick = true/);
  assert.match(gestures, /Math\.abs\(deltaX\) > 8\) suppressTrackClick = true/);
  assert.match(gestures, /if \(suppressTrackClick\)[\s\S]*event\.stopPropagation\(\)/);
  assert.match(gestures, /document\.addEventListener\('click', onBodyClick\)/);
});
