// menu lighting before/after a session on another circuit, plus a cockpit close look at the sleeves
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await br.newPage({viewport:{width:1280,height:720}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:3,mode:'trial',track:'silver',camera:'cockpit'}))});
await page.goto('http://local/');await page.waitForTimeout(7000);
const st=()=>page.evaluate(()=>({sun:App.sun.color.getHexString()+' '+App.sun.intensity.toFixed(2),hemi:App.hemi.intensity.toFixed(2),env:App.scene.environment&&App.scene.environment.uuid.slice(0,6),fog:App.scene.fog.color.getHexString(),exp:App.renderer.toneMappingExposure.toFixed(2),track:App.previewTrack&&App.previewTrack.spec.id}));
console.log('menu before',JSON.stringify(await st()));await page.screenshot({path:SP0+'env-before.png',timeout:120000});
await page.evaluate(()=>{SIM.settings.track='ardenne';App.start();});await page.waitForTimeout(8000);
console.log('in ardenne',JSON.stringify(await st()));
await page.evaluate(()=>App.quit());await page.waitForTimeout(4000);
console.log('menu after',JSON.stringify(await st()));await page.screenshot({path:SP0+'env-after.png',timeout:120000});
await page.evaluate(()=>{SIM.settings.track='silver';App.start();});await page.waitForTimeout(8000);
await page.screenshot({path:SP0+'sleeves.png',timeout:120000});
console.log('errs',errs);await br.close();})();
