const fs=require('fs');const path=require('path');const {chromium,devices}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/rv-';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
const T='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/t160/package/';
async function setup(br,opts,settings){const ctx=await br.newContext(opts);const page=await ctx.newPage();page.errs=[];page.on('pageerror',e=>page.errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(T+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((s)=>{try{localStorage.setItem('apexgp.settings',JSON.stringify(s))}catch(e){}},settings);
await page.goto('http://local/');await page.waitForTimeout(5000);return page;}
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const mode=process.argv[2]||'all';
if(mode==='all'||mode==='phone'){
 const p=await setup(br,{viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true},{quality:0,v:2,team:'ardent'});
 await p.screenshot({path:SP+'phone-menu.png'});
 for(const tab of await p.$$eval('#menu nav button, #menu .tabs button',b=>b.map(x=>x.textContent.trim()))) console.log('tab',tab);
 await p.evaluate(()=>{SIM.settings.mode='race';SIM.settings.track='parco';SIM.settings.opponents=5;App.start();});await p.waitForTimeout(7000);
 await p.screenshot({path:SP+'phone-grid.png'});
 await p.waitForTimeout(9000);await p.screenshot({path:SP+'phone-race.png'});
 console.log('phone errs',p.errs);await p.context().close();}
if(mode==='all'||mode==='pc'){
 const p=await setup(br,{viewport:{width:1280,height:720}},{quality:2,v:2,team:'massif',camera:'chase'});
 await p.screenshot({path:SP+'pc-menu.png',timeout:120000});
 await p.evaluate(()=>{SIM.settings.mode='race';SIM.settings.track='riviera';SIM.settings.opponents=7;App.start();});await p.waitForTimeout(25000);
 await p.screenshot({path:SP+'pc-race.png',timeout:180000});
 console.log('pc errs',p.errs);await p.context().close();}
await br.close();})();
