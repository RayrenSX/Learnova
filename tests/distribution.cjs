const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const version = require('../package.json').version;
for (const name of ['learnova-chaoxing', 'learnova-pintia']) {
  const script = fs.readFileSync(`dist/greasyfork/${name}.user.js`, 'utf8');
  const meta = fs.readFileSync(`dist/greasyfork/${name}.meta.js`, 'utf8');
  assert.ok(Buffer.byteLength(script) < 2 * 1000 * 1000, 'Greasy Fork edition stays below 2 MB');
  assert.ok(script.startsWith(meta.trim()));
  assert.equal(meta.match(/@version\s+(\S+)/)[1], version);
  assert.doesNotMatch(meta, /@(?:downloadURL|updateURL)\b/);
  assert.match(meta, /@grant\s+GM_info/);
  if (name === 'learnova-chaoxing') {
    assert.doesNotMatch(meta, /@match.*pintia/);
    assert.ok(!script.includes('node_modules/@codemirror/'));
  } else assert.match(meta, /@match.*pintia/);
  new vm.Script(script);
}
console.log('PASS readable platform editions: metadata, native update channel, syntax, site scope and 2 MB size limit');
