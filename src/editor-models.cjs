// Shared with the Pintia adapter: this reader is exercised against real CodeMirror 6.
function cmView(element) {
  const content = element?.querySelector('.cm-content');
  for (const node of [element, content]) {
    const view = node?.cmView?.view || node?.cmView?.rootView?.view || node?.cmView?.root?.view;
    if (view?.dom === element && view.state?.doc && typeof view.dispatch === 'function') return view;
  }
  for (let node = element, depth = 0; node && depth < 6; node = node.parentElement, depth++) {
    const key = Object.keys(node).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
    let fiber = key && node[key];
    for (let step = 0; fiber && step < 24; fiber = fiber.return, step++) {
      const view = fiber.stateNode?.codemirror;
      if (view?.dom === element && view.state?.doc && typeof view.dispatch === 'function') return view;
    }
  }
  return null;
}
module.exports = {cmView};
