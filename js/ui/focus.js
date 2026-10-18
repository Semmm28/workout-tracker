function locator(element) {
  if (element?.id) return `#${CSS.escape(element.id)}`;
  if (element?.dataset?.action) {
    return `[data-action="${CSS.escape(element.dataset.action)}"]${element.dataset.id ? `[data-id="${CSS.escape(element.dataset.id)}"]` : ''}`;
  }
  return null;
}

export function createFocusManager(root, closeDialog) {
  let opener = null;
  root.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const dialog = root.querySelector('[role="dialog"]');
    if (dialog && event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
    } else if (dialog && event.key === 'Tab') {
      const controls = Array.from(dialog.querySelectorAll('button, input, textarea, select, summary, [tabindex="0"]'))
        .filter((element) => !element.disabled && element.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"][data-action]')) {
      event.preventDefault();
      event.target.click();
    }
  });

  return function beforeRender() {
    const hadDialog = Boolean(root.querySelector('[role="dialog"]'));
    const active = locator(document.activeElement);
    return () => {
      const dialog = root.querySelector('[role="dialog"]');
      root.querySelectorAll('.phone-frame, .bottom-nav-shell').forEach((element) => { element.inert = Boolean(dialog); });
      if (dialog && !hadDialog) {
        opener = active;
        dialog.querySelector('button')?.focus({ preventScroll: true });
      } else if (!dialog && hadDialog) {
        let target = opener && root.querySelector(opener);
        if (target?.closest('[inert]')) {
          target = target.closest('.swipe-row')?.querySelector('.swipe-track[data-swipe-toggle], .swipe-track [data-action]');
        }
        (target || root.querySelector('.header button, .tab-button'))?.focus({ preventScroll: true });
        opener = null;
      }
    };
  };
}
