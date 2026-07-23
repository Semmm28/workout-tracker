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
  assert.match(rule('.screen-scroll'), /padding:\s*4px\s+0\s+var\(--nav-scroll-clearance\)/);
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
  assert.match(scroll, /scroll-padding-bottom:\s*var\(--nav-scroll-clearance\)/);
});

test('foreground navigation keeps a compact safe-area-aware bottom gap', () => {
  const root = rule(':root');

  assert.match(root, /--nav-bottom-gap:\s*clamp\(8px,\s*calc\(var\(--safe-bottom\)\s*-\s*24px\),\s*14px\)/);
  assert.match(root, /--nav-scroll-clearance:\s*calc\(103px\s*\+\s*var\(--nav-bottom-gap\)\)/);
});

test('navigation buttons center each icon and label as one group', () => {
  const tab = rule('.tab-button');

  assert.match(tab, /display:\s*flex/);
  assert.match(tab, /flex-direction:\s*column/);
  assert.match(tab, /align-items:\s*center/);
  assert.match(tab, /justify-content:\s*center/);
  assert.match(tab, /padding:\s*3px\s+1px/);
  assert.doesNotMatch(tab, /justify-content:\s*flex-end/);
});

test('overlays remain above the foreground navigation', () => {
  assert.match(
    css,
    /\.modal-backdrop,\s*\.sheet-backdrop,\s*\.toast-layer\s*\{[^}]*z-index:\s*30/s,
  );
});

test('set form controls use one shared full-width column at every viewport size', () => {
  assert.match(
    css,
    /input,\s*textarea,\s*select\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%/s,
  );
  assert.match(rule('.modal-body'), /min-width:\s*0/);
  assert.match(rule('.form-grid'), /min-width:\s*0/);
  assert.match(
    rule('.set-modal .two-col'),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.doesNotMatch(
    rule('.set-modal .two-col'),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/,
  );
  assert.match(rule('.field-group'), /min-width:\s*0/);
  assert.match(rule('.set-modal input,\n.set-modal textarea'), /width:\s*100%/);
  assert.match(rule('.set-modal input,\n.set-modal textarea'), /inline-size:\s*100%/);
  assert.match(rule('.set-modal input,\n.set-modal textarea'), /min-inline-size:\s*0/);
  assert.match(rule('.set-modal input,\n.set-modal textarea'), /max-inline-size:\s*100%/);
  assert.match(rule('.set-modal input,\n.set-modal textarea'), /min-width:\s*0/);
  assert.match(rule('.set-modal input,\n.set-modal textarea'), /max-width:\s*100%/);
  assert.match(rule('.set-modal input,\n.set-modal textarea'), /justify-self:\s*stretch/);
});

test('set modal header places close, title and submit action from left to right', () => {
  const header = rule('.set-modal-header');

  assert.match(header, /display:\s*grid/);
  assert.match(header, /grid-template-columns:\s*44px\s+minmax\(0,\s*1fr\)\s+44px/);
  assert.match(rule('.set-modal-header h2'), /margin-left:\s*6px/);
});

test('set modal save icons have full touch targets and the bottom action aligns right', () => {
  const save = rule('.set-modal-save');
  const icon = rule('.set-modal-save .save-icon');
  const footer = rule('.set-modal-bottom-actions');

  assert.match(save, /width:\s*44px/);
  assert.match(save, /min-width:\s*44px/);
  assert.match(save, /height:\s*44px/);
  assert.match(save, /min-height:\s*44px/);
  assert.match(save, /place-items:\s*center/);
  assert.match(icon, /stroke:\s*currentColor/);
  assert.match(footer, /display:\s*flex/);
  assert.match(footer, /justify-content:\s*flex-end/);
});

test('set modal is centered in the visible viewport and scrolls above the keyboard', () => {
  const backdrop = rule('.set-modal-backdrop');
  const modal = rule('.set-modal');
  const body = rule('.set-modal > .modal-body');

  assert.match(backdrop, /height:\s*var\(--visual-viewport-height\)/);
  assert.match(backdrop, /place-items:\s*center/);
  assert.match(backdrop, /overflow-y:\s*hidden/);
  assert.match(modal, /grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/);
  assert.match(modal, /max-height:\s*min\(860px,\s*100%\)/);
  assert.match(modal, /overflow:\s*hidden/);
  assert.match(body, /min-height:\s*0/);
  assert.match(body, /overflow-y:\s*auto/);
  assert.match(body, /-webkit-overflow-scrolling:\s*touch/);
});
