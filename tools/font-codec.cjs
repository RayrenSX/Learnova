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
    if (code < 0x4e00 || code > 0x9fff) return char;
    if (!record) { complete = false; return char; }
    if (!record.characters.has(char)) {
      try {
        const glyph = TyprU.codeToGlyph(record.font, code);
        const value = glyph ? table[md5(JSON.stringify(TyprU.glyphToPath(record.font, glyph))).slice(-8)] : code;
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

module.exports = { decodeClone, complete };
