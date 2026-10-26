function editorSplitter({host, panel, editor, body, handle, button, ratio, save, measure}) {
  let value = Number.isFinite(ratio) ? Math.min(1, Math.max(.15, ratio)) : null;
  let restoreValue = value !== null && value < 1 ? value : null;
  let drag = null;
  let disposed = false;
  let frame = 0;
  function bounds() {
    const fixed = [...panel.children].filter(node => node !== editor && node !== body && !node.hidden)
      .reduce((sum, node) => sum + node.getBoundingClientRect().height, 0);
    const available = Math.max(0, panel.clientHeight - fixed);
    const min = Math.min(120, available * .4);
    // Keep a small amount of room for the separator/footer borders when the
    // lower area is collapsed, so the bottom action row remains clickable.
    const max = Math.max(min, available - Math.min(8, available * .05));
    return {available, min, max};
  }
  function updateButton() {
    if (!button) return;
    const collapsed = value !== null && value >= .999;
    button.textContent = collapsed ? '⌃' : '⌄';
    button.setAttribute('aria-label', collapsed ? '恢复下方区域' : '收起下方区域');
    button.title = collapsed ? '恢复下方区域' : '收起下方区域';
    button.setAttribute('aria-pressed', String(collapsed));
  }
  function apply() {
    if (disposed || !host.isConnected || !panel.getClientRects().length || editor.matches(':fullscreen')) return;
    const {available, min, max} = bounds();
    if (!available) return;
    const desired = value ?? (host.dataset.docked === 'true' && host.dataset.tab === 'test' ? .62 : .5);
    const height = Math.max(min, Math.min(max, available * desired));
    const pixels = `${Math.round(height)}px`;
    if (editor.style.height !== pixels) {editor.style.height = pixels; measure();}
    handle.setAttribute('aria-valuenow', String(Math.round(value !== null && value >= .999 ? 100 : height / available * 100)));
    updateButton();
  }
  function schedule() {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {frame = 0; apply();});
  }
  function set(height, commit = false) {
    const {available,min,max} = bounds();
    if (!available) return;
    const clamped = Math.max(min, Math.min(max, height));
    value = height >= max ? 1 : Math.min(1, Math.max(.15, clamped / available));
    if (value < .999) restoreValue = value;
    apply(); if (commit) save(value);
  }
  function down(event) {
    if (event.button !== 0 || event.target.closest('button')) return;
    drag = {id:event.pointerId,y:event.clientY,height:editor.getBoundingClientRect().height};
    handle.setPointerCapture(event.pointerId); handle.classList.add('dragging');event.preventDefault();
  }
  function move(event) {
    if (drag?.id === event.pointerId) set(drag.height + event.clientY - drag.y);
  }
  function end(event) {
    if (drag?.id !== event.pointerId) return;
    drag=null;handle.classList.remove('dragging');
    try{handle.releasePointerCapture(event.pointerId);}catch{}
    if(value!==null)save(value);
  }
  function key(event) {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault();const {min,max}=bounds();
    const height=editor.getBoundingClientRect().height;
    set(event.key==='Home'?min:event.key==='End'?max:height+(event.key==='ArrowDown'?1:-1)*(event.shiftKey?40:10),true);
  }
  function toggleBottom() {
    if (value !== null && value >= .999) {
      set((restoreValue ?? (host.dataset.docked === 'true' && host.dataset.tab === 'test' ? .62 : .5)) * bounds().available, true);
    } else {
      const current = value ?? (host.dataset.docked === 'true' && host.dataset.tab === 'test' ? .62 : .5);
      restoreValue = current;
      set(bounds().available, true);
    }
  }
  const observer = new ResizeObserver(schedule);
  observer.observe(panel);
  for(const node of panel.children)if(node!==editor&&node!==body)observer.observe(node);
  for(const [name,callback] of [['pointerdown',down],['pointermove',move],['pointerup',end],['pointercancel',end],['lostpointercapture',end],['keydown',key]])handle.addEventListener(name,callback);
  button?.addEventListener('click', toggleBottom);
  schedule();
  return {refresh:schedule,destroy(){disposed=true;observer.disconnect();cancelAnimationFrame(frame);
    button?.removeEventListener('click', toggleBottom);
    for(const [name,callback] of [['pointerdown',down],['pointermove',move],['pointerup',end],['pointercancel',end],['lostpointercapture',end],['keydown',key]])handle.removeEventListener(name,callback);
  }};
}
module.exports={editorSplitter};
