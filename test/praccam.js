// practice: does C / the Cam button change the camera?
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const touch of [false,true]){
const ctx=await br.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});const page=await ctx.newPage();
const errs=[];page.on('pageerror',e=>errs.push(e.message));
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:3,mode:'practice',track:'silver'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>document.querySelector('#start').click());await page.waitForTimeout(4000);
const st=()=>page.evaluate(()=>{const S=App.session,P=S.race.player;return {cam:S.camMode,pitCam:S.pitCam,pit:P.pit&&P.pit.phase,phase:S.race.phase,camBtn:!!document.querySelector('[data-a="camera"],#t-camera'),paused:App.paused}});
console.log(touch?'touch':'pc','start',JSON.stringify(await st()));
for(let k=0;k<3;k++){ if(touch){const b=await page.$('#touch [data-a="camera"], #touch button:has-text("Cam")'); if(b) await b.tap(); else console.log('no cam button');} else {await page.keyboard.down('c');await page.waitForTimeout(150);await page.keyboard.up('c');} await page.waitForTimeout(500); console.log(' after',JSON.stringify(await st()));}
console.log('errs',errs.slice(0,4));await ctx.close();}
await br.close();})();
