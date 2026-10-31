// Phase 4: night / sunset on any circuit, skid marks, rain spray, sparks, heat shimmer, fireworks at the flag; PC + iPhone
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
const which=process.argv[2]||'all';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const run=async(name,vp,touch,pre,fn)=>{const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((p)=>{localStorage.setItem('apexgp.settings',JSON.stringify(Object.assign({quality:0,v:6,mode:'race',track:'silver',camera:'chase',laps:1,opponents:5,radio:'text'},p)))},pre);
await page.goto('http://local/');await page.waitForTimeout(6000);
await fn(page,(f,a)=>page.evaluate(f,a));console.log(name,'errs',errs);await ctx.close();};
const shot=(page,f)=>page.screenshot({path:SP0+'p4-'+f+'.png',timeout:240000});
if(which==='all'||which==='night'){
 if(!process.argv[3]) await run('night-menu-pc',{width:1280,height:720},false,{tod:'night'},async(page,ev)=>{await page.waitForTimeout(2000);await shot(page,'night-menu-pc');});
 if(!process.argv[3]) await run('night-race-iphone',{width:844,height:390},true,{tod:'night'},async(page,ev)=>{await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);await ev(()=>{App.session.race.lightsT=99;});await page.waitForTimeout(5000);await shot(page,'night-race-iphone');});
 await run('sunset-race-pc',{width:1280,height:720},false,{tod:'sunset'},async(page,ev)=>{await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);await ev(()=>{App.session.race.lightsT=99;});await page.waitForTimeout(4000);await shot(page,'sunset-race-pc');});
}
if(which==='all'||which==='fx'){
 await run('skids+fireworks-pc',{width:1280,height:720},false,{},async(page,ev)=>{
  await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
  // a car locking up ahead of the player down the straight: drive fake states through the skid recorder
  console.log(' skids',await ev(()=>{const P=App.session.race.player,T=App.session.race.track;const f={x:0,y:0,h:0,vx:40,vy:0,lockF:true,lockR:true,surface:'tarmac'};for(let k=0;k<40;k++){const i=(P.idx+8+k)%T.n;f.x=T.px[i]+T.nx[i]*0.6*Math.sin(k*0.15);f.y=T.py[i]+T.ny[i]*0.6*Math.sin(k*0.15);f.h=Math.atan2(T.ty[i],T.tx[i]);App.skids.update(f);}return App.skids.mesh.count;}));
  await page.waitForTimeout(2500);await shot(page,'skids-pc');
  // finish the race: fireworks
  await ev(()=>{const r=App.session.race;r.lightsT=99;const ai=new SIM.AIDriver(r.player,1.0,3);let n=0;while(!r.player.finished&&n<360*300){r.step(1/360,ai.control(1/360,r.cars,r));n++;}App.handleEvents(r);});
  console.log(' fireworks',await ev(()=>!!App.fireworks));
  await ev(()=>{const f=App.fireworks;f.t=0;for(let k=0;k<40;k++)f.update(0.05,null);App.session.camMode='far';});await page.waitForTimeout(2500);await shot(page,'flag-fireworks-pc');});
 await run('rain-iphone',{width:844,height:390},true,{weather:'wet',compound:'W',opponents:5,grid:'back'},async(page,ev)=>{
  await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
  await ev(()=>{const r=App.session.race;r.lightsT=99;const ai=new SIM.AIDriver(r.player,0.9,3);for(let n=0;n<360*14;n++)r.step(1/360,ai.control(1/360,r.cars,r));App.handleEvents(r);});
  await page.waitForTimeout(4000);await shot(page,'rain-iphone');});
}
if(which==='all'||which==='heat'){
 await run('heat-pc-high',{width:960,height:540},false,{quality:2},async(page,ev)=>{
  await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(25000);
  console.log(' heat',JSON.stringify(await ev(()=>({on:App.heatHaze,r:App.grade.uniforms.heatR.value.toFixed(3),pos:App.grade.uniforms.heatPos.value.toArray().map(v=>v.toFixed(2))}))));
  await shot(page,'heat-pc');});
}
await br.close();})();
