// 新版云盘课件的真实结构：文档自身滚动，图片列表没有 PDF.js 页节点或下一页按钮。
module.exports = ({ delayed = false } = {}) => `<!doctype html><html><head><style>
html,body{margin:0} .fileBox ul{margin:0;padding:0;list-style:none}
.fileBox li{height:440px} .fileBox img{width:100%;height:420px}
.preview-dialog__footer{position:fixed;bottom:0;height:30px}
</style></head><body><div class="fileBox"><ul>
${[1, 2, 3].map(i => `<li id="anchor${i}"><img ${delayed ? 'data-' : ''}src="/test-image.png"><span class="pageNum">${i}</span></li>`).join('')}
</ul></div><div class="preview-dialog__footer">100%</div><script>
window.positions=[];
addEventListener('scroll',()=>{
  const e=document.scrollingElement;
  window.positions.push(e.scrollTop);
  if(e.scrollHeight-e.clientHeight-e.scrollTop<2) window.reachedBottom=true;
});
</script></body></html>`;
