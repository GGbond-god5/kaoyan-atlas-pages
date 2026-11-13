import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const code = await readFile('assets/user-state.js','utf8');
let uid='a', state={a:{data:{rec:{one:1},star:{}},revision:1},b:{data:{rec:{private:1},star:{}},revision:1}};
const fetch = async (path, options={}) => {
  if(path === '/api/auth/me') return {ok:true,json:async()=>({ok:true,user:{id:uid}})};
  const current=state[uid];
  if(options.method === 'PUT') { const body=JSON.parse(options.body); if(body.revision !== current.revision) return {ok:false,status:409,json:async()=>({ok:false,error:'conflict',...structuredClone(current)})}; current.data=body.data; current.revision++; }
  return {ok:true,json:async()=>({ok:true,...structuredClone(current)})};
};
function client(){const ctx={window:{},fetch,console};vm.runInNewContext(code,ctx);return ctx.window.AtlasUser;}
const a=client();await a.ready; const local=await a.load('vocab',{}); assert.equal(a.key('photos'),'atlas.user.a.photos');
state.a.data.rec.remote=2; state.a.revision++; local.rec.one=3; await a.save('vocab',local); assert.deepEqual(state.a.data.rec,{one:3,remote:2});
local.star.first=1; const first=a.save('vocab',local); local.star.second=1; const second=a.save('vocab',local); await Promise.all([first,second]); assert.deepEqual(state.a.data,{rec:{one:3,remote:2},star:{first:1,second:1}});
uid='b'; const b=client(); await b.ready; assert.equal(b.key('photos'),'atlas.user.b.photos'); assert.equal(JSON.stringify(await b.load('vocab',{})),JSON.stringify({rec:{private:1},star:{}}));
console.log('user-state conflict, queued changes and account isolation passed');
