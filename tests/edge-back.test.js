import assert from 'node:assert/strict';
import test from 'node:test';
import { setupEdgeBackGesture } from '../js/ui/edge-back.js';

function harness(canGoBack = () => true) {
  const handlers = new Map();
  let backCount = 0;
  const cleanup = setupEdgeBackGesture({
    target: {
      addEventListener: (name, handler) => handlers.set(name, handler),
      removeEventListener: (name) => handlers.delete(name),
    },
    viewport: { innerWidth: 393 }, canGoBack, goBack: () => backCount++,
  });
  const send = (name, x = 390, y = 300, overrides = {}) => {
    const event = {
      clientX: x, clientY: y, isPrimary: true, pointerId: 1, button: 0,
      cancelable: true, target: { closest: () => null },
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.stopped = true; },
      ...overrides,
    };
    handlers.get(name)?.(event);
    return event;
  };
  return { send, cleanup, handlers, backCount: () => backCount };
}

test('right-edge swipe goes back once and prevents a release click', () => {
  const h = harness();
  h.send('pointerdown');
  assert.equal(h.send('touchstart', 390, 300, { touches: [{}] }).stopped, true);
  h.send('pointermove', 340, 303);
  h.send('pointerup', 270, 305);
  h.send('pointerup', 270, 305);
  assert.equal(h.backCount(), 1);
  assert.equal(h.send('click').prevented, true);
  h.send('pointerdown', 200);
  assert.equal(h.send('click').prevented, undefined);
});

test('scrolls, short drags, diagonal drags and non-edge gestures do not go back', () => {
  for (const [start, move, end] of [
    [[250, 300], [150, 300], [100, 300]],
    [[390, 300], [365, 300], [350, 300]],
    [[390, 300], [380, 350], [270, 351]],
    [[390, 300], [370, 305], [270, 380]],
    [[370, 300], [390, 300], [270, 300]],
  ]) {
    const h = harness();
    h.send('pointerdown', ...start);
    h.send('pointermove', ...move);
    h.send('pointerup', ...end);
    assert.equal(h.backCount(), 0);
  }
});

test('cancelled and multi-finger gestures do not navigate', () => {
  for (const cancel of ['pointercancel', 'pointerdown', 'touchstart']) {
    const h = harness();
    h.send('pointerdown');
    h.send('pointermove', 340);
    h.send(cancel, 380, 300, { pointerId: 2, isPrimary: false, touches: [{}, {}] });
    h.send('pointerup', 250);
    assert.equal(h.backCount(), 0);
  }
});

test('inputs and unavailable back destinations leave ordinary interactions untouched', () => {
  for (const input of [false, true]) {
    const h = harness(() => input);
    h.send('pointerdown', 390, 300, { target: { closest: () => input ? {} : null } });
    assert.equal(h.send('touchstart', 390, 300, { touches: [{}] }).stopped, undefined);
    h.send('pointermove', 340);
    h.send('pointerup', 250);
    assert.equal(h.backCount(), 0);
    h.cleanup();
    assert.equal(h.handlers.size, 0);
  }
});

test('a destination disappearing during a gesture does not trigger navigation', () => {
  let available = true;
  const h = harness(() => available);
  h.send('pointerdown');
  h.send('pointermove', 340);
  available = false;
  h.send('pointerup', 250);
  assert.equal(h.backCount(), 0);
});
