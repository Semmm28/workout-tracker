import test from 'node:test';
import assert from 'node:assert/strict';
import { wireAsyncForm } from '../js/ui/forms.js';
import { createController } from '../js/controller.js';
import { createFocusManager } from '../js/ui/focus.js';
import { state } from '../js/state.js';

test('a pending save runs once; failure keeps the draft and allows retry', async (t) => {
  const original = globalThis.document;
  t.after(() => { globalThis.document = original; });
  t.mock.method(console, 'warn', () => {});
  let submit, rejectSave, saves = 0;
  const form = {
    draft: '82.5',
    addEventListener: (_, callback) => { submit = callback; },
    setAttribute() {}, removeAttribute() {},
  };
  const buttons = [{ form }, { form }];
  globalThis.document = { querySelectorAll: () => buttons };
  let error;
  wireAsyncForm(form, () => {
    saves += 1;
    return new Promise((_, reject) => { rejectSave = reject; });
  }, (message) => { error = message; });
  const event = { preventDefault() {} };
  const first = submit(event);
  await submit(event);
  assert.equal(saves, 1);
  assert.ok(buttons.every((button) => button.disabled));
  rejectSave(new Error('Storage full'));
  await first;
  assert.equal(form.draft, '82.5');
  assert.match(error, /invoer blijft staan/);
  assert.ok(buttons.every((button) => !button.disabled));
  const retry = submit(event);
  assert.equal(saves, 2);
  rejectSave(new Error('Still full'));
  await retry;
});

test('showing and expiring a toast never rebuilds an open form', (t) => {
  const original = globalThis.document;
  t.after(() => { globalThis.document = original; state.toast = null; });
  const region = { innerHTML: '' };
  globalThis.document = { querySelector: () => region };
  let expire;
  t.mock.method(globalThis, 'setTimeout', (callback) => { expire = callback; });
  const controller = createController({ render: () => assert.fail('Draft was rebuilt') });
  controller.showToast('Saved <safely>');
  assert.match(region.innerHTML, /Saved &lt;safely&gt;/);
  expire();
  assert.equal(region.innerHTML, '');
  assert.equal(state.toast, null);
});

test('dialogs trap keyboard focus, isolate the background, and restore their opener', (t) => {
  const originalDocument = globalThis.document;
  const originalCSS = globalThis.CSS;
  t.after(() => { globalThis.document = originalDocument; globalThis.CSS = originalCSS; });
  globalThis.CSS = { escape: (value) => value };
  const element = (id) => ({ id, focus() { document.activeElement = this; }, getClientRects: () => [1] });
  const opener = element('open');
  const first = element('close');
  const last = element('save');
  globalThis.document = { activeElement: opener };
  let dialog = null, keydown, closed = false;
  const background = {};
  const root = {
    addEventListener: (_, callback) => { keydown = callback; },
    querySelector: (selector) => selector === '[role="dialog"]' ? dialog : opener,
    querySelectorAll: () => [background],
  };
  const beforeRender = createFocusManager(root, () => { closed = true; });
  const restore = beforeRender();
  dialog = { querySelector: () => first, querySelectorAll: () => [first, last] };
  restore();
  assert.equal(background.inert, true);
  assert.equal(document.activeElement, first);
  keydown({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(document.activeElement, last);
  keydown({ key: 'Tab', preventDefault() {} });
  assert.equal(document.activeElement, first);
  keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(closed, true);
  const close = beforeRender();
  dialog = null;
  close();
  assert.equal(background.inert, false);
  assert.equal(document.activeElement, opener);
});

test('an incoming app update keeps an open form until the user refreshes', async (t) => {
  const descriptors = Object.fromEntries(['document', 'window', 'navigator'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => Object.entries(descriptors).forEach(([key, descriptor]) => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }));
  let update, reloads = 0, editing = true, message;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { addEventListener: (_, callback) => { update = callback; } } } });
  globalThis.document = { querySelector: () => editing ? {} : null };
  globalThis.window = { location: { reload: () => { reloads += 1; } } };
  const { setupServiceWorkerAutoRefresh } = await import('../js/pwa.js?draft-update');
  setupServiceWorkerAutoRefresh((text) => { message = text; });
  update();
  assert.equal(reloads, 0);
  assert.match(message, /Rond je invoer af/);
  editing = false;
  update();
  update();
  assert.equal(reloads, 1);
});
