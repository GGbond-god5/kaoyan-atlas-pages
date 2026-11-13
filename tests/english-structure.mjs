import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = createServer(async (req,res) => { try { const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname); const data=await readFile(resolve('.', '.'+path)); res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream'); res.end(data); } catch { res.statusCode=404;res.end(); } }).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try {
 const items=[]; let captured;
 const add=(chapter,kind,n,passage)=>items.push({id:`${chapter}-${n}`,subject:'english',subjectName:'英语一',chapter,chapterTitle:chapter,kp:'',kpName:`第${n}题`,kind,text:'题目',passage,answer:'A',steps:[]});
 for(let year=2023;year<=2024;year++){for(let n=1;n<=20;n++)add(`eng-${year}`,'完形',n,`cloze-${year}`);for(let n=41;n<=45;n++)add(`eng-${year}`,'新题型',n,`new-${year}`);for(let n=46;n<=50;n++)add(`eng-${year}`,'翻译',n,'');}
 for(let group=0;group<6;group++)for(let i=0;i<(group===5?4:5);i++)add(`eng-${2020+group}`,'阅读',21+i,group===4?'':`reading-${group}`);
 const page=await browser.newPage();
 await page.route('**/assets/questions.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.QUESTIONS=${JSON.stringify({items})}`}));
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname,body=req.postDataJSON();let data={ok:true};if(path==='/api/auth/me')data.user={id:'fixture'};else if(path==='/api/state/practice')Object.assign(data,{data:null,revision:0});else if(path==='/api/personal/questions')data.items=[];else if(path==='/api/attempts'){captured={...body,results:{}};data.attempt=captured;}else if(path.endsWith('/grade')){data.result={questionId:body.questionId,status:'pending',maxScore:null};captured.results[body.questionId]=data.result;data.attempt=captured;}await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto(`http://127.0.0.1:${server.address().port}/practice.html`);await page.waitForFunction(()=>document.querySelector('#fSubject').options.length>1);await page.locator('[data-mode=diagnostic]').click();await page.locator('#fSubject').selectOption('english');await page.locator('#pstart').click();await page.locator('#submitBtn').click();await page.locator('#confirmOk').click();await page.waitForFunction(()=>!document.querySelector('#result').hidden);
 for(const [kind,size,groups] of [['完形',20,1],['阅读',5,4],['新题型',5,1],['翻译',5,1]]) {const qs=captured.questions.filter(q=>q.kind===kind);assert.equal(qs.length,size*groups,kind);const chunks=[];for(let i=0;i<qs.length;i+=size)chunks.push(qs.slice(i,i+size));for(const chunk of chunks){assert.equal(new Set(chunk.map(q=>q.chapter)).size,1,kind+' chapter');if(kind!=='翻译'){assert.ok(chunk[0].passage);assert.equal(new Set(chunk.map(q=>q.passage)).size,1,kind+' passage');}assert.deepEqual(chunk.map(q=>Number(q.kpName.match(/\d+/)[0])),chunk.map(q=>Number(q.kpName.match(/\d+/)[0])).sort((a,b)=>a-b));}}
 console.log('English complete passage grouping passed');
} finally {await browser.close();server.close();}
