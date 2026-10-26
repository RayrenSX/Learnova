const VERSION = require('../package.json').version;
const BASE = 'https://github.com/RayrenSX/Learnova/releases/latest/download/';
const GREASY_FORK = typeof LEARNOVA_DISTRIBUTION !== 'undefined' && LEARNOVA_DISTRIBUTION === 'greasyfork';

function newer(remote, local) {
  if (!/^\d+\.\d+\.\d+$/.test(remote) || !/^\d+\.\d+\.\d+$/.test(local)) return false;
  const a = remote.split('.').map(Number), b = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}

function mount(root, standalone = false) {
  if (!root || root.querySelector('[data-study-update]')) return;
  const filename = standalone ? 'pintia-helper' : 'study-helper';
  let url = BASE + filename + '.user.js';
  let metaUrl = BASE + filename + '.meta.js';
  if (GREASY_FORK) {
    // Greasy Fork injects native update URLs at install time; keep users on that channel.
    const info = typeof GM_info === 'object' ? GM_info : {};
    const candidate = info.script?.downloadURL || info.scriptMetaStr?.match(/^\/\/\s*@downloadURL\s+(\S+)/m)?.[1] || '';
    try {
      const native = new URL(candidate);
      if (native.protocol !== 'https:' || native.hostname !== 'update.greasyfork.org' || !/\/scripts\/\d+\/.*\.user\.js$/.test(native.pathname)) throw new Error('Invalid update URL');
      url = native.href;
      metaUrl = native.href.replace(/\.user\.js$/, '.meta.js');
    } catch { url = ''; metaUrl = ''; }
  }
  const interval = (GREASY_FORK ? 24 : 6) * 60 * 60 * 1000;
  const key = 'study-helper.update.' + (GREASY_FORK ? 'greasyfork.' : '') + filename;
  const header = root.querySelector('header');
  if (!header) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.studyUpdate = 'true';
  button.className = 'small';
  button.textContent = 'v' + VERSION;
  button.title = '当前版本 ' + VERSION + ' · 点击检查更新';
  button.style.cssText = 'font-size:11px;white-space:nowrap;flex:none';
  button.addEventListener('pointerdown', event => event.stopPropagation());
  header.insertBefore(button, header.lastElementChild);
  const notice = document.createElement('div');
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  notice.style.cssText = 'padding:8px 12px;background:#fff3d6;color:#654700;font:12px/1.6 system-ui';
  header.after(notice);
  let latest = '', busy = false;
  function show(text, install = false) {
    notice.replaceChildren(document.createTextNode(text));
    if (install) {
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = ' 立即更新'; link.style.color = '#155bad';
      notice.append(link);
    }
    notice.hidden = false;
  }
  async function check(manual = false) {
    if (busy) return;
    if (!metaUrl) { if (manual) show('请通过脚本管理器检查此 Greasy Fork 脚本的更新。'); return; }
    if (GREASY_FORK) {
      let previous = 0;
      try { if (typeof GM_getValue === 'function') previous = Number(GM_getValue(key + '.checked', 0)); } catch {}
      if (Date.now() - previous < interval) {
        if (manual) show(latest ? '发现新版本 v' + latest + '（当前 v' + VERSION + '）' : '今日已检查更新，当前 v' + VERSION + '。', Boolean(latest));
        return;
      }
      try { if (typeof GM_setValue === 'function') GM_setValue(key + '.checked', Date.now()); } catch {}
    }
    busy = true;
    if (manual) show('正在检查更新…');
    try {
      if (typeof GM_xmlhttpRequest !== 'function') throw new Error('缺少用户脚本网络权限');
      const remote = await new Promise((resolve, reject) => GM_xmlhttpRequest({
        method: 'GET', url: metaUrl + '?_=' + Date.now(), timeout: 15000,
        onload: response => {
          const match = response.responseText?.match(/^\/\/\s*@version\s+(\S+)/m);
          if (response.status !== 200 || !match || !/^\d+\.\d+\.\d+$/.test(match[1])) reject(new Error('更新服务暂不可用'));
          else resolve(match[1]);
        },
        onerror: () => reject(new Error('无法连接更新服务')),
        ontimeout: () => reject(new Error('检查更新超时'))
      }));
      if (typeof GM_setValue === 'function') GM_setValue(key + '.checked', Date.now());
      if (newer(remote, VERSION)) {
        latest = remote;
        if (typeof GM_setValue === 'function') GM_setValue(key + '.available', remote);
        show('发现新版本 v' + remote + '（当前 v' + VERSION + '）', true);
        let notified = '';
        try { if (typeof GM_getValue === 'function') notified = GM_getValue(key + '.notified', ''); } catch {}
        if (notified !== remote && typeof GM_notification === 'function') {
          try {
            GM_notification({title: 'Learnova 有更新', text: 'v' + VERSION + ' → v' + remote + '，点击面板中的“立即更新”安装。', timeout: 10000});
            if (typeof GM_setValue === 'function') GM_setValue(key + '.notified', remote);
          } catch {}
        }
      } else if (manual) show('当前已是最新版本 v' + VERSION);
    } catch (error) { if (manual) show(error.message + '，请稍后点击版本号重试。'); }
    finally { busy = false; }
  }
  button.addEventListener('click', () => check(true));
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('检查 Learnova 更新 · v' + VERSION, () => check(true));
  let checked = 0;
  try {
    if (typeof GM_getValue === 'function') {
      checked = Number(GM_getValue(key + '.checked', 0));
      const available = GM_getValue(key + '.available', '');
      if (newer(available, VERSION)) {
        latest = available;
        show('发现新版本 v' + latest + '（当前 v' + VERSION + '）', true);
      }
    }
  } catch {}
  if (window.top === window.self && (!Number.isFinite(checked) || Date.now() - checked >= interval)) void check();
}

module.exports = {VERSION, newer, mount};
