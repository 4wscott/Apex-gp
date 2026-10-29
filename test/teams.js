const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
async function run(br,vp,name,settings,career){const page=await br.newPage({viewport:vp});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((s)=>{try{localStorage.setItem('apexgp.settings',JSON.stringify(s));localStorage.removeItem('apexgp.career')}catch(e){}},settings);
await page.goto('http://local/');await page.waitForTimeout(9000);
if(career){await page.evaluate(()=>{document.querySelector('[data-set="mode"] button[data-v="career"]')?.click();});await page.waitForTimeout(2000);await page.selectOption('#cr-team','taurus');await page.waitForTimeout(3000);await page.evaluate(()=>document.querySelector('#cr-teaminfo').scrollIntoView());}
else await page.evaluate(()=>document.querySelector('#teams').scrollIntoView());
await page.waitForTimeout(1500);
console.log(name,await page.evaluate(()=>({imgs:[...document.querySelectorAll('img.t-car')].filter(i=>i.src).length,total:document.querySelectorAll('img.t-car').length})));
await page.screenshot({path:SP+'teams-'+name+'.png',timeout:120000});console.log(name,'errs',errs);await page.close();}
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await run(br,{width:1280,height:720},'pc',{quality:1,v:2,team:'taurus',mode:'race'});


await br.close();})();
