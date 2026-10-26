function draggableWindow({host, handle, page = window, position, save}) {
  const margin = 8;
  let disposed = false;
  let placed = false;
  let drag = null;
  let lastPosition = position;
  function place(x, y) {
    const rect = host.getBoundingClientRect();
    const left = Math.max(margin, Math.min(x, Math.max(margin, page.innerWidth - rect.width - margin)));
    const top = Math.max(margin, Math.min(y, Math.max(margin, page.innerHeight - rect.height - margin)));
    host.style.left = `${left}px`; host.style.top = `${top}px`;
    host.style.right = 'auto'; host.style.bottom = 'auto';
    lastPosition = {left, top}; placed = true;
  }
  function down(event) {
    if (host.dataset.docked === 'true') return;
    if (event.button !== 0 || event.target.closest('button,input,textarea,select,a')) return;
    const rect = host.getBoundingClientRect();
    drag = {pointer: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top};
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
    event.preventDefault();
  }
  function move(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    place(event.clientX - drag.dx, event.clientY - drag.dy);
  }
  function end(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag = null; handle.classList.remove('dragging');
    try {handle.releasePointerCapture(event.pointerId);} catch {}
    if (placed) save?.(lastPosition);
  }
  function clamp() {
    if (host.dataset.docked === 'true') return;
    if (disposed || !host.isConnected || !placed || drag) return;
    const rect = host.getBoundingClientRect(); place(rect.left, rect.top);
  }
  function key(event) {
    if (host.dataset.docked === 'true') return;
    if (event.target !== handle || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)) return;
    event.preventDefault();
    const rect = host.getBoundingClientRect(); const step = event.shiftKey ? 40 : 10;
    if (event.key === 'Home') place(page.innerWidth - rect.width - 16, 72);
    else place(rect.left + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      rect.top + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0));
    save?.(lastPosition);
  }
  handle.addEventListener('pointerdown', down); handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', key); page.addEventListener('resize', clamp);
  const observer = new ResizeObserver(clamp); observer.observe(host);
  if (position && Number.isFinite(position.left) && Number.isFinite(position.top)) place(position.left, position.top);
  else {const rect = host.getBoundingClientRect(); place(rect.left, rect.top);}
  return {clamp, destroy: () => {
    disposed = true; observer.disconnect(); page.removeEventListener('resize', clamp);
    for (const [event, callback] of [['pointerdown',down],['pointermove',move],['pointerup',end],['pointercancel',end],['keydown',key]]) handle.removeEventListener(event, callback);
  }};
}
module.exports = {draggableWindow};
