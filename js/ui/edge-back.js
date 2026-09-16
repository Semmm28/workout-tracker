const EDGE_WIDTH = 28;
const INTENT_DISTANCE = 12;
const BACK_DISTANCE = 72;

export function setupEdgeBackGesture({ canGoBack, goBack, target = document, viewport = window }) {
  let gesture = null;
  let suppressClickUntil = 0;

  const onPointerDown = (event) => {
    suppressClickUntil = 0;
    if (gesture || !event.isPrimary) {
      gesture = null;
      return;
    }
    if (event.button !== 0 || !canGoBack()) return;
    if (event.clientX < viewport.innerWidth - EDGE_WIDTH || event.clientX > viewport.innerWidth) return;
    if (event.target.closest('input, textarea, select, [contenteditable]')) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
  };

  const onPointerMove = (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = gesture.x - event.clientX;
    const dy = Math.abs(event.clientY - gesture.y);
    if (!gesture.horizontal) {
      if (Math.max(Math.abs(dx), dy) < INTENT_DISTANCE) return;
      if (dx <= 0 || dy >= dx) {
        gesture = null;
        return;
      }
      gesture.horizontal = true;
    }
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  };

  const onPointerUp = (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = gesture.x - event.clientX;
    const dy = Math.abs(event.clientY - gesture.y);
    const horizontal = gesture.horizontal;
    gesture = null;
    if (!horizontal) return;
    // Do not let the release activate a button on the newly rendered page.
    suppressClickUntil = Date.now() + 500;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    if (dx >= BACK_DISTANCE && dy < dx / 2 && canGoBack()) goBack();
  };

  const onPointerCancel = () => { gesture = null; };
  const onTouchStart = (event) => {
    if (event.touches.length > 1) {
      gesture = null;
      return;
    }
    // Reserve the edge for navigation; row swipes keep working everywhere else.
    if (gesture) event.stopPropagation();
  };
  const onClick = (event) => {
    if (Date.now() >= suppressClickUntil) return;
    suppressClickUntil = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const listeners = [
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerCancel],
    ['touchstart', onTouchStart],
    ['click', onClick],
  ];
  listeners.forEach(([name, listener]) => target.addEventListener(name, listener, { capture: true, passive: false }));
  return () => listeners.forEach(([name, listener]) => target.removeEventListener(name, listener, true));
}
