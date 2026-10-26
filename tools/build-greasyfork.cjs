const {spawnSync} = require('node:child_process');
const path = require('node:path');
for (const file of ['tools/build-full.cjs', 'pintia/tools/build.cjs']) {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '..', file)], {
    cwd:path.resolve(__dirname, '..'), env:{...process.env, LEARNOVA_TARGET:'greasyfork'}, stdio:'inherit'
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
