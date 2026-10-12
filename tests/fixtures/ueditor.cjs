// 学习通章节填空布局：显示层 + 隐藏编辑 iframe + 保存 HTML 的 textarea。
module.exports = function ueditorFixture(title, count = 5, options = {}) {
  return `<div class="TiMu newTiMu"><div class="Zy_TItle"><div class="fontLabel"><span class="newZy_TItle">【填空题】</span>${title}</div></div>
    ${Array.from({ length: count }, (_, i) => `<div class="blankItemDiv"><span>第${i + 1}空：</span><div class="blankItemInp">
      <div class="InpDIV" id="preview${i}"></div><div class="textDIV" style="display:none"><div class="edui-editor"><div class="edui-editor-iframeholder"><iframe id="ueditor_${i}"></iframe></div></div>
      <textarea id="answerEditor${i}" name="answerEditor${i}" style="display:none"></textarea></div></div></div>`).join('')}
    <input type="hidden" name="answertype1" value="2"></div><script>
    window.UE = { instants: {}, getEditor() { throw Error('Must not create editor instances'); } };
    window.editorWrites = 0;
    const config = ${JSON.stringify(options)};
    for (let i = ${count} - 1; i >= 0; i--) {
      const textarea = document.getElementById('answerEditor' + i);
      const iframe = document.getElementById('ueditor_' + i);
      const body = iframe.contentDocument.body;
      body.contentEditable = 'true';
      body.innerHTML = config.live || '<p><br></p>';
      textarea.value = config.saved ?? '<p><br></p>';
      UE.instants['ueditorInstant' + i] = {
        key: textarea.id, textarea, body, iframe, isReady: 1,
        setContent(html) {
          window.editorWrites++;
          if (!config.rejectBody) body.innerHTML = '<p>' + html + '</p>';
          document.getElementById('preview' + i).innerHTML = body.innerHTML;
        },
        sync() { if (!config.rejectSync) textarea.value = body.innerHTML; }
      };
    }
    </script>`;
};
