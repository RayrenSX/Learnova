// Independently written adapter; font parsing and hashing use MIT libraries.
const { Typr, TyprU } = require('typr-ts');
const md5 = require('blueimp-md5');
const table = require('../vendor/font-table.json');
const cache = new WeakMap();

function fontFor(doc) {
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent)
    .find(s => s.includes('font-cxsecret') && /base64,/i.test(s));
  if (!css) return null;
  const previous = cache.get(doc);
  if (previous?.css === css) return previous;
  const encoded = css.match(/url\(\s*['"]?data:[^,]*;base64,([A-Za-z0-9+/=\s]+)/i)?.[1];
  if (!encoded) return null;
  try {
    const bytes = Uint8Array.from(doc.defaultView.atob(encoded.replace(/\s/g, '')), c => c.charCodeAt(0));
    const record = { css, font: Typr.parse(bytes.buffer), characters: new Map() };
    cache.set(doc, record);
    return record;
  } catch { return null; }
}

function translate(text, record) {
  let complete = true;
  const output = Array.from(text, char => {
    const code = char.codePointAt(0);
    // 加密字体也可能把字形映射到私用区或汉字扩展区，不能把它们标成已完整解码。
    const privateUse = (code >= 0xe000 && code <= 0xf8ff) || (code >= 0xf0000 && code <= 0xffffd)
      || (code >= 0x100000 && code <= 0x10fffd);
    if (!privateUse && !/\p{Script=Han}/u.test(char)) return char;
    if (!record) { complete = false; return char; }
    if (!record.characters.has(char)) {
      try {
        const glyph = TyprU.codeToGlyph(record.font, code);
        const value = glyph ? table[md5(JSON.stringify(TyprU.glyphToPath(record.font, glyph))).slice(-8)] : privateUse ? null : code;
        record.characters.set(char, Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : null);
      } catch { record.characters.set(char, null); }
    }
    const decoded = record.characters.get(char);
    if (decoded === null) complete = false;
    return decoded ?? char;
  }).join('');
  return { text: output, complete };
}

function decodeClone(original, clone) {
  const inherited = Boolean(original.closest('.font-cxsecret'));
  const record = fontFor(original.ownerDocument);
  const walker = original.ownerDocument.createTreeWalker(clone, 4);
  let complete = true;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!inherited && !node.parentElement?.closest('.font-cxsecret')) continue;
    const result = translate(node.textContent, record);
    node.textContent = result.text;
    if (node.textContent.trim() && !result.complete) complete = false;
  }
  return complete;
}

function complete(root) {
  return decodeClone(root, root.cloneNode(true));
}

// 仅作本地缓存身份摘要（非鉴权/安全边界），避免将地址中的查询密钥复制到缓存导出。
const sourceFingerprint = text => md5(String(text));
module.exports = { decodeClone, complete, sourceFingerprint };
