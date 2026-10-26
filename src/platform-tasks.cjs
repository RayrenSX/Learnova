/*!
 * Frame-data/jobid/attachments matching adapted from OCS cx.ts searchJob.
 * Copyright (c) 2022 enncy
 * MIT License
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
function jobId(value) {
  return typeof value === 'string' && value.trim() ? value.trim()
    : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}
function nativeTask(doc, win = typeof unsafeWindow !== 'undefined' && typeof document !== 'undefined' && doc === document ? unsafeWindow : doc.defaultView) {
  let frameData;
  const ancestors = [];
  for (let current = win, depth = 0; current && depth < 8 && !ancestors.includes(current); depth++) {
    ancestors.push(current);
    try {
      const raw = current.frameElement?.getAttribute('data');
      if (!frameData && raw && raw.length <= 50000) {
        try { const value=JSON.parse(raw); if(value && !Array.isArray(value) && (jobId(value.jobid) || jobId(value._jobid))) frameData=value; } catch {}
      }
      if (current.parent === current) break;
      current=current.parent;
    } catch { break; }
  }
  const targetJobId=jobId(frameData?.jobid) || jobId(frameData?._jobid);
  if (!targetJobId) return null;
  for (const ancestor of ancestors) {
    try {
      const attachments=ancestor.attachments;
      if(!Array.isArray(attachments))continue;
      const matches=attachments.filter(attachment=>{
        const attachmentJobId=jobId(attachment?.jobid) || jobId(attachment?.property?._jobid);
        return attachmentJobId && attachmentJobId===targetJobId;
      });
      // Conflicting metadata must not complete the wrong frame.
      if(matches.length>1)return null;
      if(!matches.length)continue;
      const attachment=matches[0], property=attachment.property || {};
      return {id:String(targetJobId),mid:String(property.mid || ''),module:String(property.module || attachment.type || ''),
        title:String(property.name || property.title || property.bookname || ''),
        passed:[true,1,'1'].includes(attachment.isPassed),required:attachment.job===true || attachment.job===1};
    } catch {}
  }
  return null;
}
function nativeFinished(element) {
  if (element?.nodeType===9) return nativeTask(element)?.passed===true;
  if (element?.matches?.('video, audio, .TiMu, .questionLi, .questionBox, .questionWrap, [data-cx-question]')) return nativeTask(element.ownerDocument)?.passed===true;
  if (element?.matches?.('iframe')) {
    try {return element.contentDocument && nativeTask(element.contentDocument)?.passed===true;} catch {return false;}
  }
  if (element?.matches?.('.ans-job, .ans-attach-ct')) {
    const frames=[...element.querySelectorAll('iframe')].filter(frame=>frame.closest('.ans-job, .ans-attach-ct')===element);
    return frames.length>0 && frames.every(frame=>nativeFinished(frame));
  }
  return false;
}
module.exports={nativeTask,nativeFinished};
