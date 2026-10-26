// Shared guard for asynchronous code/discussion/review drafts.
async function run({root, target, signal, fresh, request, write, verify, phase}) {
  if (signal.aborted || !fresh()) throw new Error('任务已取消');
  if (!root?.isConnected || !target?.element?.isConnected) throw new Error('编辑器已离开当前页面');
  const before = target.read(), revision = target.revision?.();
  let edited = false;
  const docs = new Set([root.ownerDocument || root, target.element.ownerDocument]);
  const onEdit = event => {
    if (!event.isTrusted) return;
    if (root.contains(event.target) || target.element.contains(event.target)) edited = true;
  };
  for (const doc of docs) for (const name of ['input','change','keydown','paste','cut']) doc.addEventListener(name, onEdit, true);
  const current = () => !signal.aborted && fresh() && root.isConnected && target.element.isConnected && (!target.current || target.current());
  try {
    const result = await request();
    if (!current()) throw new Error('页面或设置已变化，已取消草稿写入');
    if (edited || before !== target.read() || target.revision?.() !== revision) throw new Error('查询期间编辑器已被手动修改，已保留你的内容');
    phase?.('writing');
    write(result);
    if (!current() || !verify(result)) throw new Error('编辑器内容回读不一致，请在原页面核对');
    return result;
  } finally {
    for (const doc of docs) for (const name of ['input','change','keydown','paste','cut']) doc.removeEventListener(name, onEdit, true);
  }
}
module.exports = { run };
