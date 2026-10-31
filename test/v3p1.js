// v3 Phase 1 UI: difficulty presets on PC and iPhone, assists reach the car
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,vp,touch] of [['pc',{width:1280,height:720},false],['iphone',{width:390,height:844},true]]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:6,mode:'practice',track:'silver',camera:'chase'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{Menu.drawer('settings');document.querySelector('.tab[data-panel="p-assist"]').click();});await page.waitForTimeout(400);
const st=()=>ev(()=>({diff:SIM.settings.difficulty,stab:SIM.settings.stab,ba:SIM.settings.brakeAssist,tc:SIM.settings.tc,ai:SIM.settings.aiPace,pressed:document.querySelector('[data-set="difficulty"] [aria-pressed="true"]')&&document.querySelector('[data-set="difficulty"] [aria-pressed="true"]').dataset.v}));
console.log(name,'start (migrated)',JSON.stringify(await st()));
for(const v of ['beginner','pro','intermediate']){await ev((v)=>document.querySelector(`[data-set="difficulty"] [data-v="${v}"]`).click(),v);await page.waitForTimeout(300);console.log(' ',v,JSON.stringify(await st()));}
await ev(()=>document.querySelector('[data-set="brakeAssist"] [data-v="true"]').click());console.log('  braking assist on ->',JSON.stringify(await st()));
await ev(()=>document.querySelector('[data-set="difficulty"] [data-v="beginner"]').click());
await page.screenshot({path:SP0+'v3p1-'+name+'.png',timeout:120000});
await ev(()=>{Menu.drawer(null);document.querySelector('#start').click();});await page.waitForTimeout(7000);
console.log('  car assists',JSON.stringify(await ev(()=>{const P=App.session.race.player;App.frame(performance.now()+16);return P.assist;})));
console.log('  errs',errs);await ctx.close();}
await br.close();})();
