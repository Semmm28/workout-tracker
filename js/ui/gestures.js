import { ACTION_WIDTH } from '../constants.js';

let touchCleanup = null;

function setActionAvailability(row, open) {
  const track = row.querySelector('.swipe-track');
  const actions = row.querySelector('.swipe-actions');
  if (track?.hasAttribute('data-swipe-toggle')) {
    track.setAttribute('aria-expanded', String(open));
  }
  if (!actions) return;

  actions.setAttribute('aria-hidden', String(!open));
  if (open) actions.removeAttribute('inert');
  else actions.setAttribute('inert', '');
  actions.querySelectorAll('button').forEach((button) => {
    button.tabIndex = open ? 0 : -1;
  });
}

export function closeSwipeRows() {
  document.querySelectorAll('.swipe-row').forEach((row) => {
    row.classList.remove('is-open', 'is-revealing');
    const track = row.querySelector('.swipe-track');
    if (track) track.style.transform = 'translateX(0px)';
    setActionAvailability(row, false);
  });
}

export function wireSwipeRows() {
  if (touchCleanup) touchCleanup();
  const rows = Array.from(document.querySelectorAll('.swipe-row'));
  if (!rows.length) return;

  const listeners = [];
  let activeTrack = null;
  let startX = 0;
  let startY = 0;
  let startTranslate = 0;
  let isDragging = false;
  let hasHorizontalIntent = false;
  let hasVerticalIntent = false;

  const setOpenTrack = (track, open, width = ACTION_WIDTH) => {
    rows.forEach((row) => {
      const candidate = row.querySelector('.swipe-track');
      if (candidate !== track) {
        row.classList.remove('is-open', 'is-revealing');
        if (candidate) candidate.style.transform = 'translateX(0px)';
        setActionAvailability(row, false);
      }
    });
    const row = track.closest('.swipe-row');
    if (row) {
      row.classList.toggle('is-open', open);
      row.classList.remove('is-revealing');
      setActionAvailability(row, open);
    }
    track.style.transform = `translateX(${open ? -width : 0}px)`;
  };

  rows.forEach((row) => {
    const track = row.querySelector('.swipe-track');
    const actions = row.querySelector('.swipe-actions');
    const actionWidth = Number(row.dataset.actionWidth || ACTION_WIDTH);
    const canToggleOnClick = track.hasAttribute('data-swipe-toggle');
    let suppressTrackClick = false;
    let suppressClickTimer = null;

    const onTouchStart = (event) => {
      if (event.target.closest('.swipe-actions')) return;
      const touch = event.touches[0];
      activeTrack = track;
      isDragging = true;
      hasHorizontalIntent = false;
      hasVerticalIntent = false;
      startX = touch.clientX;
      startY = touch.clientY;
      const match = /translateX\((-?\d+)px\)/.exec(track.style.transform || 'translateX(0px)');
      startTranslate = match ? Number(match[1]) : 0;
    };

    const onTouchMove = (event) => {
      if (!isDragging || activeTrack !== track) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!hasHorizontalIntent && !hasVerticalIntent) {
        if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
        if (Math.abs(deltaY) >= Math.abs(deltaX)) {
          hasVerticalIntent = true;
          suppressTrackClick = true;
          return;
        }
        hasHorizontalIntent = true;
        row.classList.remove('is-open');
        setActionAvailability(row, false);
      }
      if (!hasHorizontalIntent) return;

      if (Math.abs(deltaX) > 8) suppressTrackClick = true;
      const next = Math.min(0, Math.max(-actionWidth, startTranslate + deltaX));
      row.classList.toggle('is-revealing', next < -6);
      track.style.transform = `translateX(${next}px)`;
    };

    const onTouchEnd = () => {
      if (!isDragging || activeTrack !== track) return;
      if (hasHorizontalIntent) {
        const match = /translateX\((-?\d+)px\)/.exec(track.style.transform || 'translateX(0px)');
        const current = match ? Number(match[1]) : 0;
        setOpenTrack(track, current < -(actionWidth * 0.4), actionWidth);
      }
      if (suppressTrackClick) {
        clearTimeout(suppressClickTimer);
        suppressClickTimer = setTimeout(() => {
          suppressTrackClick = false;
        }, 400);
      }
      isDragging = false;
      activeTrack = null;
      hasHorizontalIntent = false;
      hasVerticalIntent = false;
    };

    const onRowClickCapture = (event) => {
      if (suppressTrackClick) {
        suppressTrackClick = false;
        clearTimeout(suppressClickTimer);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!track.contains(event.target)) return;
      if (!canToggleOnClick) return;
      event.preventDefault();
      event.stopPropagation();
      setOpenTrack(track, !row.classList.contains('is-open'), actionWidth);
    };

    const onTrackKeyDown = (event) => {
      if (!canToggleOnClick) return;
      if (event.key === 'Escape' && row.classList.contains('is-open')) {
        event.preventDefault();
        setOpenTrack(track, false, actionWidth);
        track.focus({ preventScroll: true });
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      const willOpen = !row.classList.contains('is-open');
      setOpenTrack(track, willOpen, actionWidth);
      if (willOpen) actions?.querySelector('button')?.focus({ preventScroll: true });
    };

    const onRowKeyDown = (event) => {
      if (event.key !== 'Escape' || !row.classList.contains('is-open')) return;
      event.preventDefault();
      setOpenTrack(track, false, actionWidth);
      track.focus({ preventScroll: true });
    };

    row.addEventListener('touchstart', onTouchStart, { passive: true });
    row.addEventListener('touchmove', onTouchMove, { passive: true });
    row.addEventListener('touchend', onTouchEnd, { passive: true });
    row.addEventListener('touchcancel', onTouchEnd, { passive: true });
    row.addEventListener('click', onRowClickCapture, true);
    track.addEventListener('keydown', onTrackKeyDown);
    row.addEventListener('keydown', onRowKeyDown);
    listeners.push(() => row.removeEventListener('touchstart', onTouchStart));
    listeners.push(() => row.removeEventListener('touchmove', onTouchMove));
    listeners.push(() => row.removeEventListener('touchend', onTouchEnd));
    listeners.push(() => row.removeEventListener('touchcancel', onTouchEnd));
    listeners.push(() => row.removeEventListener('click', onRowClickCapture, true));
    listeners.push(() => track.removeEventListener('keydown', onTrackKeyDown));
    listeners.push(() => row.removeEventListener('keydown', onRowKeyDown));
    listeners.push(() => clearTimeout(suppressClickTimer));
  });

  const onBodyTouchStart = (event) => {
    if (!event.target.closest('.swipe-row')) closeSwipeRows();
  };
  const onBodyClick = (event) => {
    if (!event.target.closest('.swipe-row')) closeSwipeRows();
  };
  document.addEventListener('touchstart', onBodyTouchStart, { passive: true });
  document.addEventListener('click', onBodyClick);
  listeners.push(() => document.removeEventListener('touchstart', onBodyTouchStart));
  listeners.push(() => document.removeEventListener('click', onBodyClick));
  touchCleanup = () => listeners.forEach((removeListener) => removeListener());
}
