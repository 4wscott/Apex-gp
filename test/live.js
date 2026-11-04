// settings changed mid-session take effect straight away (no restart): touch steering/layout, mirrors, quality, car setup (locked once a race is green)
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,vp,touch,mode] of [['iphone practice',{width:844,height:390},true,'practice'],['pc race',{width:1280,height:720},false,'race']]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((m)=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:7,mode:m,track:'silver',camera:'cockpit',mirrors:true,opponents:3,laps:3}));window.DeviceMotionEvent=window.DeviceMotionEvent||function(){};DeviceMotionEvent.requestPermission=()=>Promise.resolve('granted');},mode);
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
await ev(()=>{App.togglePause(true);document.querySelector('#p-settings').click();});await page.waitForTimeout(500);
const click=(sel)=>ev((s)=>document.querySelector(s).click(),sel);const tab=(p)=>click(`.tab[data-panel="${p}"]`);
const out={};
if(touch){await tab('p-controls');
  for(const v of ['wheel','tilt','pad','buttons']){await click(`[data-set="touchSteer"] [data-v="${v}"]`);await page.waitForTimeout(300);out['steer '+v]=await ev(()=>document.querySelector('#t-steer').className+(document.querySelector('#t-centre')?' +Centre':''));}
  await click('[data-set="touchLayout"] [data-v="swap"]').catch(()=>{});await page.waitForTimeout(200);out.layout=await ev(()=>document.querySelector('#touch').className);}
await tab('p-gfx');
await click('[data-set="quality"] [data-v="1"]');await page.waitForTimeout(500);out.mirrorsAtMedium=await ev(()=>!!App.session.mirror);
await click('[data-set="mirrors"] [data-v="false"]');await page.waitForTimeout(300);out.mirrorsOff=await ev(()=>!App.session.mirror);
await click('[data-set="mirrors"] [data-v="true"]');await page.waitForTimeout(300);out.mirrorsOn=await ev(()=>!!App.session.mirror);
await click('[data-set="quality"] [data-v="0"]');await page.waitForTimeout(500);out.mirrorsAtLow=await ev(()=>!!App.session.mirror);
await tab('p-setup');
const cla=()=>ev(()=>+App.session.race.player.p.ClA.toFixed(3));
out.claBefore=await cla();
await ev(()=>{const w=document.querySelector('#su-wing');w.value=4;w.dispatchEvent(new Event('input'));});await page.waitForTimeout(600);
out.claAfterWing4=await cla();out.flash=await ev(()=>document.querySelector('#flash').textContent);
if(mode==='race'){await ev(()=>{App.session.race.lightsT=99;App.session.race.phase='green';});const w=await ev(()=>{const w=document.querySelector('#su-wing');w.value=-4;w.dispatchEvent(new Event('input'));});await page.waitForTimeout(600);out.claDuringRace=await cla();out.flashRace=await ev(()=>document.querySelector('#flash').textContent);}
out.stillPaused=await ev(()=>App.paused);
await page.screenshot({path:SP0+'live-'+name.split(' ')[0]+'.png',timeout:180000});
console.log(name,JSON.stringify(out,null,1),'errs',errs);await ctx.close();}
await br.close();})();
