'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {once}=require('node:events');
const {createApp}=require('../server/index.cjs');const {validate}=require('../server/content.cjs');
const temporaryRoot=path.resolve(__dirname,'../tmp');fs.mkdirSync(temporaryRoot,{recursive:true});
test('CMS end to end: auth, all sections, publication, uploads, conflicts, reorder and restart',async()=>{
 const dataDir=fs.mkdtempSync(path.join(temporaryRoot,'cms-test-'));const origin='http://127.0.0.1:5809';const setupToken='test-only-setup-token';let app,cookie='',csrf='';
 async function start(){app=createApp({dataDir,origin,setupToken});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');}
 async function stop(){await new Promise(r=>app.server.close(r));app.store.close();}
 async function call(url,{method='GET',data,headers={},raw,authenticated=true}={}){const response=await fetch(`http://127.0.0.1:${app.server.address().port}`+url,{method,headers:{Origin:origin,...(data!==undefined?{'Content-Type':'application/json'}:{}),...(authenticated?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...headers},body:raw??(data===undefined?undefined:JSON.stringify(data))});return {response,body:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text()};}
 try{
  await start();
  const seed=(await call('/api/content')).body;assert.equal(seed.projects.length,4);assert.equal(seed.certifications.length,5);assert.equal(seed.achievements.length,9);assert.equal(seed.education.length,1);
  assert.equal((await call('/api/admin/items/projects')).response.status,401);
  assert.equal((await call('/server/seed.json')).response.status,404);assert.equal((await call('/.data/portfolio.sqlite')).response.status,404);assert.equal((await call('/.data/setup-token')).response.status,404);
  assert.equal((await call('/api/auth/setup',{method:'POST',data:{username:'owner',password:'Example!2026',setup_token:'wrong'}})).response.status,403);
  assert.equal((await call('/api/auth/setup',{method:'POST',data:{username:'owner',password:'Example!2026',setup_token:setupToken}})).response.status,201);
  assert.equal((await call('/api/auth/setup',{method:'POST',data:{username:'other',password:'Example!2026',setup_token:setupToken}})).response.status,409);
  assert.equal((await call('/api/auth/login',{method:'POST',data:{username:'owner',password:'incorrect'}})).response.status,401);
  let login=await call('/api/auth/login',{method:'POST',data:{username:'owner',password:'Example!2026'}});assert.equal(login.response.status,200);cookie=login.response.headers.get('set-cookie').split(';')[0];csrf=login.body.csrf;assert.match(login.response.headers.get('set-cookie'),/HttpOnly/);
  assert.equal((await call('/api/admin/items/skills',{method:'POST',headers:{'X-CSRF-Token':'wrong'},data:{name:'Skill',status:'draft'}})).response.status,403);
  assert.equal((await call('/api/admin/items/skills',{method:'POST',headers:{Origin:'https://hostile.test'},data:{name:'Skill',status:'draft'}})).response.status,403);
  const required={projects:{title:'New project',slug:'new-project',tech_stack:['JS'],short_description:'<img src=x onerror=alert(1)>'},certifications:{certificate_name:'New certificate',issuer:'Issuer'},achievements:{title:'New award'},skills:{name:'New skill'},experience:{title:'Developer',organization:'Company'},education:{degree:'Degree',institution:'College'}};
  for(const [type,fields]of Object.entries(required)){
   let result=await call('/api/admin/items/'+type,{method:'POST',data:{...fields,status:'draft'}});assert.equal(result.response.status,201,JSON.stringify(result.body));let item=result.body;
   assert(!(await call('/api/content')).body[type].some(i=>i.id===item.id));
   result=await call('/api/admin/items/'+type+'/'+item.id,{method:'PUT',data:{...item,status:'published'}});assert.equal(result.response.status,200);const stale=item;item=result.body;
   assert((await call('/api/content')).body[type].some(i=>i.id===item.id));
   assert.equal((await call('/api/admin/items/'+type+'/'+item.id,{method:'PUT',data:stale})).response.status,409);
   assert.equal((await call('/api/admin/items/'+type+'/'+item.id,{method:'DELETE',data:{version:stale.version}})).response.status,409);
   let order=(await call('/api/admin/items/'+type)).body.reverse();let reordered=await call('/api/admin/items/'+type+'/reorder',{method:'PUT',data:order.map(i=>({id:i.id,version:i.version}))});assert.equal(reordered.response.status,200);assert.equal(reordered.body[0].id,item.id);
   assert.equal((await call('/api/admin/items/'+type+'/reorder',{method:'PUT',data:order.map(i=>({id:i.id,version:i.version}))})).response.status,409);
   item=reordered.body[0];const draft=await call('/api/admin/items/'+type+'/'+item.id,{method:'PUT',data:{...item,status:'draft'}});assert.equal(draft.response.status,200);assert(!(await call('/api/content')).body[type].some(i=>i.id===item.id));
   assert.equal((await call('/api/admin/items/'+type+'/'+item.id,{method:'DELETE',data:{version:draft.body.version}})).response.status,200);
  }
  assert.equal((await call('/api/admin/items/projects',{method:'POST',data:{...seed.projects[0],status:'draft'}})).response.status,409);
  assert.equal((await call('/api/admin/items/projects',{method:'POST',data:{title:'Bad',slug:'bad-url',github_url:'javascript:alert(1)',status:'draft'}})).response.status,400);
  assert.equal((await call('/api/admin/items/certifications',{method:'POST',data:{certificate_name:'Bad date',issuer:'Issuer',issue_date:'2026-02-31',status:'draft'}})).response.status,400);
  assert.equal((await call('/api/admin/uploads',{method:'POST',headers:{'Content-Type':'image/svg+xml'},raw:'<svg onload="alert(1)"/>'})).response.status,415);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
  let upload=await call('/api/admin/uploads',{method:'POST',headers:{'Content-Type':'image/png'},raw:png});assert.equal(upload.response.status,201);assert.equal((await call(upload.body.url)).response.status,200);
  const persisted=await call('/api/admin/items/achievements',{method:'POST',data:{title:'Persistent award',image:upload.body.url,status:'published'}});assert.equal(persisted.response.status,201);
  const html=(await call('/')).body;assert(html.includes('Persistent award'));assert(html.includes('<strong>Siri</strong>'));assert(html.includes('class="project-card"'));assert.match(html,/portfolio-theme\.css\?v=\d+/);
  assert.equal((await call('/api/admin/site',{method:'PUT',data:{aboutTitle:'A persisted title'}})).response.status,200);
  const oldCookie=cookie;
  const changed=await call('/api/auth/credentials',{method:'PUT',data:{username:'new-owner',password:'Changed!2026',current_password:'Example!2026'}});assert.equal(changed.response.status,200);cookie=changed.response.headers.get('set-cookie').split(';')[0];csrf=changed.body.csrf;
  assert.equal((await call('/api/admin/items/projects',{headers:{Cookie:oldCookie}})).response.status,401);
  assert.equal((await call('/api/auth/login',{method:'POST',data:{username:'owner',password:'Example!2026'}})).response.status,401);
  await stop();await start();const publicAfter=(await call('/api/content')).body;assert(publicAfter.achievements.some(i=>i.id===persisted.body.id));assert.equal(publicAfter.site.aboutTitle,'A persisted title');assert.equal((await call(upload.body.url)).response.status,200);assert.equal(publicAfter.projects.length,4);
  login=await call('/api/auth/login',{method:'POST',data:{username:'new-owner',password:'Changed!2026'}});assert.equal(login.response.status,200);cookie=login.response.headers.get('set-cookie').split(';')[0];csrf=login.body.csrf;
  assert.equal((await call('/api/auth/logout',{method:'POST',data:{}})).response.status,200);assert.equal((await call('/api/admin/items/projects')).response.status,401);
 }finally{if(app?.server.listening)await stop();assert(dataDir.startsWith(temporaryRoot+path.sep));fs.rmSync(dataDir,{recursive:true,force:true});}
});
test('validation rejects malformed dates, types and fields',()=>{
 for(const issue_date of ['not-a-date','2026-99-99','2026-02-31'])assert.throws(()=>validate('certifications',{certificate_name:'C',issuer:'I',issue_date,status:'draft'}),/valid date/);
 assert.throws(()=>validate('skills',{name:'x',status:'draft',unknown:'field'}),/Unknown field/);
 assert.throws(()=>validate('projects',{title:'x',slug:'x',tech_stack:'JavaScript',status:'draft'}),/40 short values/);
});
