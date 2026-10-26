// 仿课程侧栏，使用脚本已适配的原生目录入口；不访问真实账号。
module.exports = () => `
<style>
body{margin:0;background:#eef1f6;font-family:Arial,"Microsoft YaHei",sans-serif}body>h1,body>.nextChapter{display:none}
.course-stage{margin:36px 440px 0 40px;color:#26354b}.course-stage h2{font-size:21px;font-weight:500}.video-placeholder{height:350px;background:#1a2232;border-radius:8px;display:grid;place-items:center;color:#a7b2c5;font-size:14px;margin-top:26px}
#courseSidebar{position:fixed;right:20px;top:28px;bottom:20px;width:min(380px,calc(100vw - 40px));background:white;overflow:auto;border:1px solid #e2e8f0;box-sizing:border-box}
.native-tabs{padding:20px;color:#6a768c;border-bottom:1px solid #eee}.native-list{padding:12px}.native-list h3{font-size:13px;background:#f7f9fc;padding:12px}.posCatalog_select{padding:13px;font-size:13px;cursor:pointer}.posCatalog_active{background:#eef3ff}.icon_Completed{float:right;color:#40a089}.icon_Completed:after{content:'✓'}
</style>
<div class="course-stage"><small>课程学习 / 章节内容</small><h2>1.2 总体国家安全观的科学内涵</h2><div class="video-placeholder">课程内容区域</div><p>课程目录与学习操作在右侧统一管理。</p></div>
<aside id="courseSidebar"><div class="native-tabs">目录　讨论　笔记　标注</div><div class="native-list">
${[
  ['第一章 完整准确领会总体国家安全观', ['1.1 总体国家安全观的创立', '1.2 总体国家安全观的科学内涵', '1.3 总体国家安全观的重点领域和基本特征']],
  ['第二章 在党的领导下走好中国特色国家安全道路', ['2.1 坚持党对国家安全工作的绝对领导', '2.2 坚持中国特色国家安全道路', '2.3 推进国家安全体系和能力现代化']],
  ['第三章 更好统筹发展和安全', ['3.1 统筹发展与安全', '3.2 坚持底线思维', '3.3 更好维护国家安全']]
].map(([title, children], g) => `<h3 class="posCatalog_title">${title}</h3>${children.map((text, i) => `<div class="posCatalog_select${g === 0 && i === 1 ? ' posCatalog_active' : ''}${g === 2 && i === 2 ? ' locked' : ''}" id="cur${g + 1}${i + 1}">
${g === 0 && i === 0 ? '<span class="icon_Completed"></span>' : ''}${g === 2 && i === 2 ? '<span class="icon_lock"></span>' : ''}
<span class="posCatalog_name" title="${text}" onclick="window.chapterClicks=(window.chapterClicks||[]);window.chapterClicks.push(this.parentElement.id);document.querySelectorAll('.posCatalog_active').forEach(n=>n.classList.remove('posCatalog_active'));this.parentElement.classList.add('posCatalog_active')">${text}</span></div>`).join('')}`).join('')}
</div><div hidden><iframe title="笔记编辑器" src="about:blank"></iframe></div></aside>`;
