module.exports = async function({test,setup,choice,checked,logContains,aiSettings,assert}) {
  await test('二次深审 A02：后题先返回也不越过前题写入',async()=>{
    const {page}=await setup(choice(1,'慢题',['甲','乙'])+choice(2,'快题',['甲','乙']),{...aiSettings,queryInterval:1000},[],
      {delayByTitle:{'慢题':3200,'快题':30}});
    await page.waitForFunction(()=>window.aiRequests.length===2,undefined,{timeout:3000});await page.waitForTimeout(250);
    assert.equal(await page.locator('.TiMu input:checked').count(),0);
    await checked(page,'input[name="q1"][value="B"]');await checked(page,'input[name="q2"][value="B"]');
  });
  await test('二次深审 B01：小数题干保留数字，明确题号可清理',async()=>{
    const {page}=await setup(choice(1,'3.14 是圆周率的近似值吗？',['是','否']),{...aiSettings});
    await checked(page,'input[value="B"]');
    assert.equal(await page.evaluate(()=>JSON.parse(window.aiRequests[0].payload.messages[1].content).question),'3.14 是圆周率的近似值吗？');
  });
  await test('二次深审 B02：页面缓存恢复重新启动，目录可更新，暂停状态不被自动开启',async()=>{
    const body='<div id="catalog"><div class="posCatalog_select posCatalog_active" id="cur1"><span class="posCatalog_name" onclick="window.opened=1">第一章</span></div></div><video id="v"></video>';
    const {page}=await setup(body,{autoAnswer:false,autoNext:false});
    await page.waitForFunction(()=>document.querySelector('#v').playCalls>0);
    await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
      document.getElementById('catalog').insertAdjacentHTML('beforeend','<div class="posCatalog_select" id="cur2"><span class="posCatalog_name" onclick="window.opened=2">第二章</span></div>');});
    await logContains(page,'已从浏览器页面缓存恢复');
    await page.locator('#cx-video-helper-host .chapter-link').filter({hasText:'第二章'}).waitFor({state:'attached'});
    await page.locator('#cx-video-helper-host #toggle').click();
    await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    assert.equal(await page.locator('#cx-video-helper-host #toggle').textContent(),'开始');
    const count=await page.locator('#v').evaluate(v=>v.playCalls);await page.waitForTimeout(1100);assert.equal(await page.locator('#v').evaluate(v=>v.playCalls),count);
  });
};
