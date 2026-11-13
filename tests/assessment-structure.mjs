import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url), { chromium } = require('playwright');
const root=resolve('.'), server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const data=await readFile(resolve(root,'.'+path));res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try {
  const page=await browser.newPage(), items=[]; let captured;
  const add=(subject,kind,n,more={})=>items.push({id:`${subject}-${n}-${kind}`,subject,subjectName:subject,chapter:`${subject}-topic`,chapterTitle:'专题',kp:`kp-${n}`,kpName:`考点${n}`,kind,text:'题目',answer:'A',steps:[],...more});
  ['计算题','填空题','选择题','证明题'].forEach((x,i)=>add('math',x,i));
  ['大作文','翻译','阅读','完形','小作文','新题型'].forEach((x,i)=>add('english',x,i));
  ['计算题','填空题','选择题'].forEach((x,i)=>add('math2',x,i));
  ['大作文','翻译','阅读','完形','小作文','新题型'].forEach((x,i)=>add('english2',x,i));
  ['分析题','多选题','单选题'].forEach((x,i)=>add('politics',x,i));
  add('mechanics','计算题',3,{kpName:'第3题'}); add('mechanics','填空题',1,{kpName:'第1题'}); add('mechanics','简答题',2,{kpName:'第2题'});
  add('math','计算题',11,{chapter:'math-paper',kp:'',kpName:'第11题'}); add('math','选择题',1,{chapter:'math-paper',kp:'',kpName:'第1题'});
  await page.route('**/assets/questions.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.QUESTIONS=${JSON.stringify({items})}`}));
  await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname,body=req.postDataJSON();let data={ok:true};if(path==='/api/auth/me')data.user={id:'fixture'};else if(path==='/api/state/practice')Object.assign(data,{data:null,revision:0});else if(path==='/api/personal/questions')data.items=[];else if(path==='/api/attempts'){captured={...body,results:{}};data.attempt=captured;}else if(path.endsWith('/grade')){data.result={questionId:body.questionId,status:'pending',maxScore:null};captured.results[body.questionId]=data.result;data.attempt=captured;}await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
  await page.goto(`http://127.0.0.1:${server.address().port}/practice.html`);
  await page.waitForFunction(()=>document.querySelector('#fSubject').options.length>1);
  await page.locator('[data-mode=diagnostic]').click(); assert.equal(await page.locator('#pstart').isDisabled(),true);
  const cases=[['math',['选择题','填空题','计算题','证明题']],['math2',['选择题','填空题','计算题']],['english',['小作文','大作文']],['english2',['翻译','小作文','大作文']],['politics',['单选题','多选题','分析题']],['mechanics',['填空题','简答题','计算题']]];
  for(const [subject,expected] of cases){
    await page.locator('#fSubject').selectOption(subject);
    const note=await page.locator('#structureInfo').textContent(); assert.match(note,/满分待核/); if(subject!=='mechanics')assert.match(note,/缺题/);
    await page.locator('#pstart').click();await page.locator('#submitBtn').click();await page.locator('#confirmOk').click();await page.waitForFunction(()=>!document.querySelector('#result').hidden);
    assert.equal(captured.subject,subject);assert.ok(captured.questions.every(q=>q.subject===subject));
    const kinds=captured.questions.map(q=>q.kind);
    if(subject==='math') {const rank={'选择题':0,'填空题':1,'计算题':2,'证明题':2}; assert.deepEqual(kinds.map(k=>rank[k]),kinds.map(k=>rank[k]).sort()); assert.ok(kinds.includes('填空题'));}
    else assert.deepEqual(kinds,expected);
    await page.waitForFunction(()=>!document.querySelector('#backSetup').disabled);await page.locator('#backSetup').click();
  }
  await page.locator('[data-mode=paper]').click();await page.locator('#fSubject').selectOption('math');await page.locator('#fPaper').selectOption('math-paper');assert.match(await page.locator('#structureInfo').textContent(),/满分待核/);
  await page.locator('#pstart').click();await page.locator('#submitBtn').click();await page.locator('#confirmOk').click();await page.waitForFunction(()=>!document.querySelector('#result').hidden);
  assert.deepEqual(captured.questions.map(q=>q.kpName),['第1题','第11题']);assert.ok(captured.questions.every(q=>q.subject==='math'));
  console.log('assessment structure fixture passed');
} finally {await browser.close();server.close();}
