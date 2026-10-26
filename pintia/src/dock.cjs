function dockWorkspace({host, page, enabled = () => true, onChange = () => {}}) {
  const doc = page.document;
  let pane = null;
  let suppressed = new Map();
  let disposed = false;
  const style = doc.createElement('style');
  style.textContent = '[data-pintia-workspace-pane]{position:relative!important;isolation:isolate}[data-pintia-workspace-native]{opacity:0!important;pointer-events:none!important}';
  doc.head.append(style);
  function restore() {
    for (const [node, old] of suppressed) {
      if (old === null) node.removeAttribute('data-pintia-workspace-native'); else node.setAttribute('data-pintia-workspace-native', old);
    }
    suppressed.clear();
    if (pane) pane.removeAttribute('data-pintia-workspace-pane');
    pane = null;
  }
  function refresh() {
    if (disposed) return;
    const candidates = [...doc.querySelectorAll('[data-e2e="code-editor-input"]')].filter(node => node.isConnected && node.querySelector('.cm-content[contenteditable="true"]'));
    const target = enabled() && candidates.length === 1 ? candidates[0].closest('[class*="answerInput_"]') : null;
    if (!target) {
      const wasDocked = !!pane;
      restore();
      if (!host.isConnected || wasDocked) {
        doc.documentElement.append(host);
        host.dataset.docked = 'false';
        host.style.cssText = 'position:fixed;right:16px;top:72px;z-index:2147483600;max-width:calc(100vw - 16px)';
        onChange(false);
      }
      return;
    }
    if (pane !== target) {
      restore(); pane = target;
      pane.setAttribute('data-pintia-workspace-pane','');
      pane.append(host);
      host.dataset.docked = 'true';
      host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:30;min-width:0;min-height:0';
      onChange(true);
    } else if (host.parentElement !== pane) pane.append(host);
    for (const child of pane.children) {
      if (child === host || suppressed.has(child)) continue;
      suppressed.set(child, child.getAttribute('data-pintia-workspace-native'));
      child.setAttribute('data-pintia-workspace-native','');
    }
  }
  return {refresh,get docked(){return !!pane;},destroy(){disposed=true;restore();style.remove();}};
}
module.exports = {dockWorkspace};
