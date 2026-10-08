import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigationTransition } from '../js/ui/navigation-transition.js';

function screen() {
  const classes = new Set();
  const scroll = { scrollTop: 120 };
  return {
    style: {}, offsetTop: 16, offsetLeft: 16, offsetWidth: 360, offsetHeight: 700,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    querySelector: () => scroll, querySelectorAll: () => [], setAttribute() {},
    remove() { this.removed = true; },
    cloneNode: () => screen(),
    animate(frames) {
      this.frames = frames;
      return this.animation = { finished: new Promise(resolve => { this.finish = resolve; }), cancel() {} };
    },
  };
}

test('opening slides from the right; back slides out right and restores layout/scroll', async () => {
  for (const direction of ['forward', 'back']) {
    let current = screen();
    let clone;
    const root = { querySelector: () => current };
    const transition = createNavigationTransition(root, () => false);
    const render = () => { current = screen(); current.parentNode = { append: value => { clone = value; } }; };
    transition(render, direction);
    assert.equal(current.frames[0].transform, direction === 'back' ? 'translateX(-25%)' : 'translateX(100%)');
    assert.equal(clone.frames[1].transform, direction === 'back' ? 'translateX(100%)' : 'translateX(-25%)');
    assert.equal(clone.style.left, '16px');
    assert.equal(clone.querySelector().scrollTop, 120);
    assert.equal(clone.inert, true);
    clone.finish();
    await Promise.resolve();
    assert.equal(clone.removed, true);
    assert.equal(current.style.zIndex, '');
  }
});

test('reduced motion skips animations and rapid navigation removes the previous clone', () => {
  let current = screen();
  let clone;
  const root = { querySelector: () => current };
  const render = () => { current = screen(); current.parentNode = { append: value => { clone = value; } }; };
  createNavigationTransition(root, () => true)(render, 'forward');
  assert.equal(clone, undefined);
  const transition = createNavigationTransition(root, () => false);
  transition(render, 'forward');
  const oldClone = clone;
  transition(render, 'back');
  assert.equal(oldClone.removed, true);
  assert.notEqual(clone, oldClone);
});
