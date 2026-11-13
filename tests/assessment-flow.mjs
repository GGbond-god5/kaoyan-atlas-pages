import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url), { chromium } = require('playwright');
const root = resolve('.');
const server = createServer(async (req,res) => {
  try { const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname); const data = await readFile(resolve(root,'.'+path)); res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)] || 'application/octet-stream'); res.end(data); } catch { res.statusCode=404; res.end(); }
}).listen(0,'127.0.0.1');
await new Promise(r => server.once('listening',r));
const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try {
  const page = await browser.newPage(); const calls = []; let attempt;
  await page.route('**/assets/questions.js*', route => route.fulfill({contentType:'text/javascript',body:`window.QUESTIONS={items:[{id:'q1',subject:'math',subjectName:'数学一',chapter:'math-01',chapterTitle:'第一章',kp:'kp-01',kpName:'考点一',kind:'选择题',difficulty:'易',text:'题目\\nA. 一\\nB. 二',answer:'A',steps:['解析一'],maxScore:5,reviewStatus:'needs_review',reviewReason:'参考资料有分歧'},{id:'q2',subject:'math',subjectName:'数学一',chapter:'math-02',chapterTitle:'第二章',kp:'kp-02',kpName:'考点二',kind:'计算题',text:'计算',answer:'42',steps:['解析二'],maxScore:10}]};`}));
  await page.route('**/api/**', async route => {
    const req=route.request(), url=new URL(req.url()), body=req.postDataJSON(); calls.push([url.pathname,body]); let data={ok:true};
    if(url.pathname==='/api/auth/me') data.user={id:'test'};
    else if(url.pathname==='/api/state/practice') Object.assign(data,{data:null,revision:0});
    else if(url.pathname==='/api/personal/questions') data.items=[];
    else if(url.pathname==='/api/attempts') { attempt={...body,results:{}}; data.attempt=attempt; }
    else if(url.pathname.endsWith('/grade')) { const q=attempt.questions.find(q=>q.id===body.questionId); attempt.results[q.id]={questionId:q.id,status:'graded',score:q.id==='q1'?5:7,maxScore:q.maxScore,comments:'夹具反馈'}; data.attempt=attempt; data.result=attempt.results[q.id]; }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/practice.html?subject=math&chapter=math-01&kp=kp-01&difficulty=易`);
  await page.waitForFunction(()=>document.querySelector('#pcount').textContent.includes('1 题'));
  assert.equal(await page.locator('#fDiff').inputValue(),'易');
  await page.locator('#fDiff').selectOption('all');
  await page.locator('[data-mode=diagnostic]').click(); await page.locator('#pstart').click();
  assert.equal(await page.locator('#reveal').isHidden(),true); assert.equal(await page.locator('#psol').isHidden(),true);
  await page.keyboard.press('Space'); assert.equal(await page.locator('#solution').isHidden(),true); assert.equal(calls.filter(x=>x[0].includes('/grade')).length,0);
  assert.equal(await page.locator('#photoCamera').getAttribute('capture'), 'environment');
  assert.equal(await page.locator('#photoFile').getAttribute('capture'), null);
  if (await page.locator('#qtext [data-opt=A]').count()) await page.evaluate(() => (document.querySelector('#next').disabled ? document.querySelector('#prev') : document.querySelector('#next')).click());
  assert.equal(await page.locator('#photoTake').isVisible(), true);
  assert.equal(await page.locator('#photoPick').isVisible(), true);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#photoPick').click()]);
  await page.evaluate(() => (document.querySelector('#next').disabled ? document.querySelector('#prev') : document.querySelector('#next')).click());
  await chooser.setFiles({name:'answer.png', mimeType:'image/png', buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')});
  await page.waitForFunction(async () => {
    const db = await new Promise((resolve,reject) => { const request=indexedDB.open(window.AtlasUser.key('atlas-practice-photos')); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
    return await new Promise(resolve => {const req=db.transaction('photos').objectStore('photos').get('q2'); req.onsuccess=()=>resolve(!!req.result);});
  });
  assert.equal(await page.locator('#photoPreview').isHidden(), true);
  await page.evaluate(() => (document.querySelector('#next').disabled ? document.querySelector('#prev') : document.querySelector('#next')).click());
  await page.waitForFunction(() => !document.querySelector('#photoPreview').hidden);
  await page.locator('#photoRemove').click();
  await page.waitForFunction(() => document.querySelector('#photoPreview').hidden);
  const [camera] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#photoTake').click()]);
  await camera.setFiles({name:'camera.png', mimeType:'image/png', buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')});
  await page.waitForFunction(() => !document.querySelector('#photoPreview').hidden);
  await page.locator('#photoRemove').click();
  await page.waitForFunction(() => document.querySelector('#photoPreview').hidden);
  await page.evaluate(() => (document.querySelector('#next').disabled ? document.querySelector('#prev') : document.querySelector('#next')).click());
  if (await page.locator('#qtext [data-opt=A]').count() === 0) await page.locator('#next').click();
  await page.locator('#qtext [data-opt=A]').click(); await page.locator('#submitBtn').click(); await page.locator('#confirmOk').click();
  await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('已评分 2 / 2'));
  assert.equal(attempt.subject,'math'); assert.equal(attempt.questions.length,2); assert.equal(calls.filter(x=>x[0].endsWith('/grade')).length,2);
  await page.locator('[data-review="0"]').click(); assert.equal(await page.locator('#solution').isHidden(),false); assert.match(await page.locator('#aiResult').textContent(),/夹具反馈/);
  if(attempt.questions[0].id==='q1') assert.match(await page.locator('#solution').textContent(),/待核/);
  await page.locator('#reveal').click(); await page.locator('#masteryOpen').click();
  const masteryText = await page.locator('#masteryDialog').textContent();
  for (const label of ['客观辨析','信息理解','翻译表达','写作表达','计算求解','论证分析']) assert.match(masteryText, new RegExp(label));
  assert.match(masteryText,/待评估/); assert.match(masteryText,/知识点掌握/);
  assert.equal(await page.locator('#masteryDialog svg circle').count(),2);
  assert.equal(await page.locator('#masteryDialog svg polygon[fill="#ad493d55"]').count(),0);
  console.log('assessment fixture passed');
} finally { await browser.close(); server.close(); }

