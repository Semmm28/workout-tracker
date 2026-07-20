import { ACTION_WIDTH } from '../constants.js';

let touchCleanup = null;

export function closeSwipeRows() {
  document.querySelectorAll('.swipe-row').forEach((row) => {
    row.classList.remove('is-open', 'is-revealing');
    const track = row.querySelector('.swipe-track');
    if (track) track.style.transform = 'translateX(0px)';
  });
}

export function wireSwipeRows() {
  if (touchCleanup) touchCleanup();
  const rows = Array.from(document.querySelectorAll('.swipe-row'));
  if (!rows.length) return;

  const listeners = [];
  let activeTrack = null;
  let startX = 0;
  let startTranslate = 0;
  let isDragging = false;

  const setOpenTrack = (track, open, width = ACTION_WIDTH) => {
    rows.forEach((row) => {
      const candidate = row.querySelector('.swipe-track');
      if (candidate !== track) {
        row.classList.remove('is-open', 'is-revealing');
        if (candidate) candidate.style.transform = 'translateX(0px)';
      }
    });
    const row = track.closest('.swipe-row');
    if (row) {
      row.classList.toggle('is-open', open);
      row.classList.remove('is-revealing');
    }
    track.style.transform = `translateX(${open ? -width : 0}px)`;
  };

  rows.forEach((row) => {
    const track = row.querySelector('.swipe-track');
    const actionWidth = Number(row.dataset.actionWidth || ACTION_WIDTH);
    const onTouchStart = (event) => {
      const touch = event.touches[0];
      activeTrack = track;
      isDragging = true;
      startX = touch.clientX;
      row.classList.remove('is-open');
      const match = /translateX\((-?\d+)px\)/.exec(track.style.transform || 'translateX(0px)');
      startTranslate = match ? Number(match[1]) : 0;
      row.classList.toggle('is-revealing', startTranslate !== 0);
    };
    const onTouchMove = (event) => {
      if (!isDragging || activeTrack !== track) return;
      const touch = event.touches[0];
      const delta = touch.clientX - startX;
      const next = Math.min(0, Math.max(-actionWidth, startTranslate + delta));
      row.classList.toggle('is-revealing', next < -6);
      track.style.transform = `translateX(${next}px)`;
    };
    const onTouchEnd = () => {
      if (!isDragging || activeTrack !== track) return;
      const match = /translateX\((-?\d+)px\)/.exec(track.style.transform || 'translateX(0px)');
      const current = match ? Number(match[1]) : 0;
      setOpenTrack(track, current < -(actionWidth * 0.4), actionWidth);
      isDragging = false;
      activeTrack = null;
    };

    row.addEventListener('touchstart', onTouchStart, { passive: true });
    row.addEventListener('touchmove', onTouchMove, { passive: true });
    row.addEventListener('touchend', onTouchEnd, { passive: true });
    listeners.push(() => row.removeEventListener('touchstart', onTouchStart));
    listeners.push(() => row.removeEventListener('touchmove', onTouchMove));
    listeners.push(() => row.removeEventListener('touchend', onTouchEnd));
  });

  const onBodyTouchStart = (event) => {
    if (!event.target.closest('.swipe-row')) closeSwipeRows();
  };
  document.addEventListener('touchstart', onBodyTouchStart, { passive: true });
  listeners.push(() => document.removeEventListener('touchstart', onBodyTouchStart));
  touchCleanup = () => listeners.forEach((removeListener) => removeListener());
}
