const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await br.newPage({viewport:{width:960,height:540}});
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{try{localStorage.setItem('apexgp.settings','{"quality":1,"mirrors":false,"v":2,"camera":"chase","laps":10}')}catch(e){}});
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>{SIM.settings.mode='race';SIM.settings.track='parco';SIM.settings.opponents=5;SIM.settings.laps=10;SIM.settings.camera='chase';App.start();});await page.waitForTimeout(6000);
await page.evaluate(()=>{const r=App.session.race;r.lightsT=99;});await page.waitForTimeout(1500);
// put the player just before pit entry and press M
await page.evaluate(()=>{const r=App.session.race,P=r.player,T=r.track;const d0=P.dist;P.place((r.pit.a-25+T.n)%T.n,0,40);P.dist=d0;P.lastS=P.s;});
await page.keyboard.press('m');await page.waitForTimeout(400);
const st=()=>page.evaluate(()=>{const P=App.session.race.player;return {pit:P.pit&&P.pit.phase,kmh:Math.round(P.vx*3.6),req:P.pitReq,hud:document.querySelector('#h-wear').textContent,banner:document.querySelector('#banner')&&document.querySelector('#banner').textContent};});
console.log('after M',await st());
for(let k=0;k<14;k++){await page.waitForTimeout(1500);const s=await st();console.log(k,JSON.stringify(s));if(k===3||k===7)await page.screenshot({path:SP+'pit'+k+'.png',timeout:120000});}
console.log('errs',errs);await br.close();})();
