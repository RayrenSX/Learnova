// 独立临时浏览器、离线页面和本地生成的视频；不访问真实课程或用户资料。
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const net = require('node:net');

(async () => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const launch = { headless: false,
    args: [`--remote-debugging-port=${port}`],
    ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] };
  if (process.env.CX_TEST_BROWSER) launch.executablePath = process.env.CX_TEST_BROWSER;
  else if (process.platform === 'win32') launch.channel = 'msedge';
  const browser = await chromium.launch(launch);
  const results = [];
  try {
    // 默认连接会强制模拟焦点。以 noDefaults 连接临时浏览器的默认上下文，保留真实窗口可见性。
    const nativeBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    const context = nativeBrowser.contexts()[0];
    await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body:
      '<!doctype html><title>CX isolated playback verification</title><video id="video" width="640" height="360" muted controls></video>' }));
    const page = await context.newPage();
    await page.goto('https://mooc1.chaoxing.com/mycourse/studentstudy');
    await page.evaluate(async () => {
      const values = { 'cxVideoHelper.settings.v1': { enabled: false, autoNext: false, autoAnswer: false } };
      window.GM_getValue = (key, fallback) => values[key] ?? fallback;
      window.GM_setValue = (key, value) => { values[key] = value; };
      window.GM_registerMenuCommand = () => {};
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const blob = new Promise(resolve => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })); });
      recorder.start();
      let index = 0;
      const timer = setInterval(() => {
        ctx.fillStyle = index++ % 2 ? '#2244aa' : '#22aa44';
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = '#ffffff'; ctx.font = '30px sans-serif'; ctx.fillText(`Frame ${index}`, 40, 100);
      }, 100);
      await new Promise(resolve => setTimeout(resolve, 18000));
      recorder.stop(); clearInterval(timer);
      const video = document.querySelector('video');
      video.src = URL.createObjectURL(await blob);
      stream.getTracks().forEach(track => track.stop());
      window.nativeHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get.bind(document);
      window.nativePause = HTMLMediaElement.prototype.pause;
      window.samples = { updates: 0, pauses: 0, visibilityPauses: 0 };
      video.addEventListener('timeupdate', () => window.samples.updates++);
      video.addEventListener('pause', () => window.samples.pauses++);
      // 比助手更早注册的页面监听器，使用原型方法请求暂停。
      window.addEventListener('visibilitychange', () => {
        if (window.nativeHidden()) {
          window.samples.visibilityPauses++;
          HTMLMediaElement.prototype.pause.call(video);
        }
      }, true);
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', '学习通学习助手.user.js'), 'utf8') });
    await page.locator('#cx-video-helper-host #toggle').click();
    await page.waitForFunction(() => !document.querySelector('video').paused && document.querySelector('video').currentTime > 0.2);
    const session = await context.newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    const sample = () => page.evaluate(() => ({ ...window.samples, hidden: window.nativeHidden(),
      paused: document.querySelector('video').paused, time: document.querySelector('video').currentTime }));
    const before = await sample();
    await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    await page.waitForTimeout(5000);
    const minimized = await sample();
    assert.equal(minimized.hidden, true, 'Window must really be hidden');
    assert.equal(minimized.paused, false);
    assert.ok(minimized.updates > before.updates + 3, 'Real video must continue advancing');
    assert.ok(minimized.visibilityPauses > 0, 'Site pause listener must have run');
    assert.equal(minimized.pauses, before.pauses, `Minimizing must not add pauses: ${JSON.stringify({ before, minimized })}`);
    results.push({ scenario: 'real video in minimized window with early site pause listener', before, after: minimized });

    await page.evaluate(() => window.nativePause.call(document.querySelector('video')));
    await page.waitForFunction(() => !document.querySelector('video').paused, null, { timeout: 2000 });
    await page.waitForTimeout(2500);
    const recovered = await sample();
    assert.ok(recovered.updates > minimized.updates);
    assert.equal(recovered.paused, false);
    results.push({ scenario: 'cached native pause recovers while minimized', after: recovered });

    await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    const other = await context.newPage();
    await other.goto('https://mooc1.chaoxing.com/isolated-other-tab');
    await other.bringToFront();
    await page.waitForTimeout(3500);
    const switched = await sample();
    assert.equal(switched.hidden, true);
    assert.equal(switched.paused, false);
    assert.ok(switched.updates > recovered.updates);
    results.push({ scenario: 'real video continues after switching tabs', after: switched });
    console.log(JSON.stringify(results, null, 2));
    fs.mkdirSync(path.join(__dirname, '..', 'test-results'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '..', 'test-results', 'real-playback.json'), JSON.stringify({
      environment: 'Headed isolated browser, generated real WebM, actual minimized window; no live course or API', results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
