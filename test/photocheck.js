const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs=[];
for (const [team,drv] of [['rossa',null]]) {
const page=await br.newPage({viewport:{width:960,height:540}});page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((t)=>{try{localStorage.setItem('apexgp.settings',JSON.stringify({quality:1,mirrors:false,v:2,team:t}))}catch(e){}},team);
await page.goto('http://local/');await page.waitForTimeout(5000);
await page.evaluate(()=>{document.querySelector('#menu').hidden=true;window.DEBUG_CAM=[6,1.2,-5,14,0,6];});await page.waitForTimeout(4000);await page.screenshot({path:SP+'lu-'+team+'.png',timeout:120000});
console.log(await page.evaluate(()=>Object.fromEntries(['asphalt','grass','gravel','concrete','runoff'].map(k=>[k,GFX.tex[k].image.constructor.name+' '+GFX.tex[k].image.width])))); await page.screenshot({path:SP+'lu-road.png',timeout:120000});
await page.close();}
console.log('errs',errs);await br.close();})();
