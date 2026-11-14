import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url), {chromium}=require('playwright');
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname); const b=await readFile(resolve('.', '.'+p));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(p)]||'application/octet-stream');res.end(b);}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage();
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(r.request().url().endsWith('/api/auth/me')?{user:{id:'new-user'}}:{profile:{isDefault:false,subjects:['math']}})}));
 await page.addInitScript(()=>localStorage.setItem('atlas.welcome.pending','new-user'));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await page.locator('#welcomeDialog').waitFor({state:'visible',timeout:6000});
 assert.match(await page.locator('#welcomeDialog').innerText(),/知识图谱/);
 await page.getByRole('button',{name:'我是老手'}).click();
 assert.equal(await page.locator('#welcomeDialog').isVisible(),false);
 assert.equal(await page.evaluate(()=>localStorage.getItem('atlas.welcome.pending')),null);
 console.log('new user guide opens and can be skipped');
}finally{await browser.close();server.close();}
