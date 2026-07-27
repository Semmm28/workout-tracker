import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInitials,
  estimateE1rm,
  formatWeight,
  normalizeOptionalRpe,
  safeText,
} from '../js/utils.js';

test('estimateE1rm uses the existing Epley calculation', () => {
  assert.equal(estimateE1rm(100, 8), 100 * (1 + 8 / 30));
});

test('formatWeight keeps integers compact and rounds decimals to one place', () => {
  assert.equal(formatWeight(100), '100');
  assert.equal(formatWeight(97.54), '97.5');
  assert.equal(formatWeight('invalid'), '');
});

test('normalizeOptionalRpe accepts empty or half-step values from 1 through 10', () => {
  assert.equal(normalizeOptionalRpe(''), '');
  assert.equal(normalizeOptionalRpe(' 8.5 '), '8.5');
  assert.equal(normalizeOptionalRpe('10'), '10');
  assert.equal(normalizeOptionalRpe('0.5'), null);
  assert.equal(normalizeOptionalRpe('7.3'), null);
  assert.equal(normalizeOptionalRpe('invalid'), null);
});

test('safeText escapes values before they enter rendered HTML', () => {
  assert.equal(safeText('<script>"test" & more</script>'), '&lt;script&gt;&quot;test&quot; &amp; more&lt;/script&gt;');
});

test('buildInitials supports one or more words', () => {
  assert.equal(buildInitials('Technogym'), 'TE');
  assert.equal(buildInitials('Life Fitness'), 'LF');
  assert.equal(buildInitials(''), '--');
});
