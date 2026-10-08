// Keep the old screen only for the 220 ms transition; forms and tabs stay live.
export function createNavigationTransition(root, reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  let cleanup = () => {};
  return (render, direction) => {
    cleanup();
    const old = root.querySelector('.phone-frame');
    const snapshot = direction && old?.animate && !reducedMotion() ? old.cloneNode(true) : null;
    const scrollTop = old?.querySelector('.screen-scroll')?.scrollTop || 0;
    render();
    if (!snapshot) return;
    const current = root.querySelector('.phone-frame');
    if (!current) return;
    current.classList.add('navigation-active');
    snapshot.classList.add('navigation-snapshot');
    snapshot.inert = true;
    snapshot.setAttribute('aria-hidden', 'true');
    // Clones must not compete with live form/chart IDs.
    snapshot.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    current.parentNode.append(snapshot);
    Object.assign(snapshot.style, { left: `${current.offsetLeft}px`, top: `${current.offsetTop}px`, width: `${current.offsetWidth}px`, height: `${current.offsetHeight}px` });
    const scroll = snapshot.querySelector('.screen-scroll');
    if (scroll) scroll.scrollTop = scrollTop;
    const back = direction === 'back';
    const timing = { duration: 220, easing: 'cubic-bezier(.22,.68,0,1)' };
    const incoming = current.animate([{ transform: `translateX(${back ? '-25%' : '100%'})` }, { transform: 'translateX(0)' }], timing);
    const outgoing = snapshot.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${back ? '100%' : '-25%'})` }], timing);
    snapshot.style.zIndex = back ? '2' : '0';
    current.style.zIndex = '1';
    const finish = () => { incoming.cancel(); outgoing.cancel(); snapshot.remove(); current.style.zIndex = ''; current.classList.remove('navigation-active'); };
    cleanup = finish;
    outgoing.finished.then(finish, () => {});
  };
}
