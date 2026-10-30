// Phase 1: presets, performance meter, interpolation, on PC and iPhone (upright menu + sideways race)
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,vp,touch] of [['pc',{width:1280,height:720},false],['iphone',{width:844,height:390},true]]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:6,mode:'practice',track:'silver',camera:'chase'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{document.querySelector('#m-gear').click();document.querySelector('.tab[data-panel="p-gfx"]').click();});await page.waitForTimeout(400);
const pre=async()=>ev(()=>({preset:SIM.settings.preset,q:SIM.settings.quality,mir:SIM.settings.mirrors,auto:SIM.settings.autoRes,pressed:[...document.querySelectorAll('[data-set="preset"] [aria-pressed="true"]')].map(b=>b.dataset.v).join()}));
console.log(name,'initial',JSON.stringify(await pre()));
for(const v of ['smooth','beautiful','balanced']){await ev((v)=>document.querySelector(`[data-set="preset"] [data-v="${v}"]`).click(),v);await page.waitForTimeout(800);console.log(' ',v,JSON.stringify(await pre()));}
await ev(()=>document.querySelector('[data-set="mirrors"] [data-v="'+(!SIM.settings.mirrors)+'"]').click());console.log('  after mirrors toggle',JSON.stringify(await pre()));
await ev(()=>document.querySelector('[data-set="showPerf"] [data-v="true"]').click());
await page.screenshot({path:SP0+'p1-'+name+'-gfx.png',timeout:120000});
// back to Low so the test browser can run the race
await ev(()=>{document.querySelector('[data-set="quality"] [data-v="0"]').click();document.querySelector('#drawer-close').click();document.querySelector('#start').click();});await page.waitForTimeout(9000);
console.log(' perf shown',await ev(()=>!document.querySelector('#perf').hidden),'text',await ev(()=>document.querySelector('#perf-fps').textContent+' '+document.querySelector('#perf-ms').textContent));
// interpolation sanity: car positions shown vs physics within one step
console.log(' interp',JSON.stringify(await ev(()=>{const P=App.session.race.player;const m=P.mesh.grp.position;return {meshVsSim:Math.hypot(m.x-P.x,-m.z-P.y).toFixed(3),speed:P.vx.toFixed(1)};})));
await page.screenshot({path:SP0+'p1-'+name+'-race.png',timeout:120000});
console.log(' errs',errs);await ctx.close();}
await br.close();})();
