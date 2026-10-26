// OCS's executable transforms run in an opaque-origin, CSP-confined Worker.
// Only explicit request fields / response data cross the channel; no GM API or page DOM.
function evaluateHandler(source, input, signal, {timeoutMs = 1500, doc = document} = {}) {
  if (typeof source !== 'string' || source.length > 50000) return Promise.reject(new Error('OCS handler 无效或过长'));
  return new Promise((resolve, reject) => {
    const frame = doc.createElement('iframe'); frame.hidden = true; frame.setAttribute('sandbox','allow-scripts');
    const channel = new MessageChannel(); let timer, settled = false;
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      channel.port1.close(); channel.port2.close(); frame.remove(); error ? reject(error) : resolve(value);
    };
    const abort = () => finish(new Error('OCS handler 已取消'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort',abort,{once:true});
    const workerMain = function () {
      self.onmessage = async event => {
        try {
          const handler = new Function(event.data.source)();
          if (typeof handler !== 'function') throw new Error('not a function');
          const value = await handler(event.data.input);
          self.postMessage({ok:true,value});
        } catch { self.postMessage({ok:false}); }
        self.close();
      };
    };
    const code = '(' + workerMain.toString() + ')();';
    frame.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\' blob:; worker-src blob:; connect-src \'none\'"><script>'
      + 'addEventListener("message",function boot(e){if(!e.ports[0])return;removeEventListener("message",boot);'
      + 'const p=e.ports[0];try{const u=URL.createObjectURL(new Blob([e.data.code],{type:"text/javascript"}));const w=new Worker(u);'
      + 'w.onmessage=m=>{p.postMessage(m.data);w.terminate();URL.revokeObjectURL(u)};w.onerror=()=>p.postMessage({ok:false});'
      + 'w.postMessage(e.data.payload)}catch{p.postMessage({ok:false})}});</script>';
    channel.port1.onmessage = event => event.data?.ok ? finish(null,event.data.value) : finish(new Error('OCS handler 执行失败'));
    frame.onload = () => frame.contentWindow.postMessage({code,payload:{source,input}},'*',[channel.port2]);
    timer = setTimeout(() => finish(new Error('OCS handler 超时或当前页面 CSP 禁止隔离运行')),timeoutMs);
    doc.documentElement.appendChild(frame);
  });
}
async function transformData(config, env, signal, evaluate = evaluateHandler) {
  const output = {...config.data};
  const transformedKeys = new Set();
  for (const [key, value] of Object.entries(output)) if (value && typeof value === 'object' && typeof value.handler === 'string') {
    output[key] = await evaluate(value.handler, env, signal);
    transformedKeys.add(key);
  }
  return {...config,data:output,transformedKeys};
}
function candidates(info) {
  if (!Array.isArray(info)) return [];
  const pairs = info.every(Array.isArray) ? info : [info];
  return pairs.filter(pair => pair.length >= 2 && pair[1] !== undefined && pair[1] !== null)
    .map(pair => ({question:pair[0],answers:pair[1]}));
}
module.exports = {evaluateHandler,transformData,candidates};
