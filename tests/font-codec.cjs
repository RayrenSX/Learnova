const { chromium } = require('playwright');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Typr, TyprU } = require('typr-ts');
const md5 = require('blueimp-md5');

(async () => {
  // Public MIT demo font: remap the A glyph to a Chinese code point to reproduce
  // the platform's mismatch between stored characters and visible outlines.
  const raw = fs.readFileSync(require.resolve('typr-ts/demo/LiberationSans-Bold.ttf'));
  const sourceFont = Typr.parse(raw);
  const gid = TyprU.codeToGlyph(sourceFont, 65);
  const fingerprint = md5(JSON.stringify(TyprU.glyphToPath(sourceFont, gid))).slice(-8);
  const cmap = Buffer.alloc(40);
  cmap.writeUInt16BE(1, 2); cmap.writeUInt16BE(0, 4); cmap.writeUInt16BE(4, 6); cmap.writeUInt32BE(12, 8);
  cmap.writeUInt16BE(12, 12); cmap.writeUInt32BE(28, 16); cmap.writeUInt32BE(1, 24);
  cmap.writeUInt32BE(0x5502, 28); cmap.writeUInt32BE(0x5502, 32); cmap.writeUInt32BE(gid, 36);
  const font = Buffer.concat([raw, cmap]);
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    const offset = 12 + i * 16;
    if (font.toString('ascii', offset, offset + 4) === 'cmap') {
      font.writeUInt32BE(raw.length, offset + 8); font.writeUInt32BE(cmap.length, offset + 12);
    }
  }
  const decoded = 0x5c0a; // 尊
  const bundled = await esbuild.build({ entryPoints: [path.join(__dirname, '../tools/font-codec.cjs')], bundle: true,
    write: false, platform: 'browser', format: 'iife', globalName: 'CXFontCodec', plugins: [{ name: 'test-table',
      setup(build) {
        build.onLoad({ filter: /font-table\.json$/ }, () => ({ contents: JSON.stringify({ [fingerprint]: decoded }), loader: 'json' }));
      },
    }] });
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>@font-face{font-family:cxsecret;src:url("data:font/ttf;base64,${font.toString('base64')}")} .font-cxsecret{font-family:cxsecret}</style>
      <section id="question"><span class="font-cxsecret">唂重</span><label><input type="radio" onclick="window.clicked=true">普通文字</label></section>`);
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
    const result = await page.evaluate(() => {
      const original = document.getElementById('question');
      const clone = original.cloneNode(true);
      const complete = CXFontCodec.decodeClone(original, clone);
      original.querySelector('input').click();
      return { complete, decoded: clone.textContent, original: original.textContent, clicked: window.clicked,
        repeated: CXFontCodec.complete(original) };
    });
    assert.equal(result.complete, true);
    assert.equal(result.repeated, true);
    assert.ok(result.decoded.startsWith('尊重'));
    assert.ok(result.original.startsWith('唂重'));
    assert.equal(result.clicked, true);
    // An unrecognized real glyph must remain unresolved rather than becoming
    // a null character or being treated as correctly decoded text.
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../学习通学习助手.user.js'), 'utf8').match(/\/\/ FONT_CODEC_BEGIN([\s\S]*?)\/\/ FONT_CODEC_END/)[1] });
    assert.equal(await page.evaluate(() => CXFontCodec.complete(document.getElementById('question'))), false);
    await page.setContent('<section class="font-cxsecret" id="english">The manager will take over. 1, 2, 3.</section><section class="font-cxsecret" id="unknown">密文</section>');
    assert.equal(await page.evaluate(() => CXFontCodec.complete(document.getElementById('english'))), true);
    assert.equal(await page.evaluate(() => CXFontCodec.complete(document.getElementById('unknown'))), false);
    console.log('PASS Actual TTF parsing, encoded character mapping, cache reuse, original DOM events, unknown glyph fallback');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
