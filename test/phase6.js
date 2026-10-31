// Phase 6: rival + head-to-head, contract offers at season end, upgrade parts on the car; PC + iPhone
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,vp,touch] of [['pc',{width:1280,height:720},false],['iphone',{width:390,height:844},true]]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:6,mode:'career'}));localStorage.removeItem('apexgp.career');});
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{document.querySelector('#cr-team').value='verdant';document.querySelector('#cr-team').dispatchEvent(new Event('change'));document.querySelector('#cr-start').click();});await page.waitForTimeout(1500);
console.log(name,'rival',JSON.stringify(await ev(()=>({rival:Career.data.rival,name:Career.rival()&&Career.rival().dr.name,team:Career.rival()&&Career.rival().tm.name,shown:!!document.querySelector('.rival')}))));
// give development points and buy every upgrade to level 5 to see all the parts
await ev(()=>{Career.data.rd.points=2000;for(const k of ['aero','grip','power'])for(let i=0;i<5;i++)Career.upgrade(k);});await page.waitForTimeout(3000);
console.log(' parts on preview car',await ev(()=>App.previewCar.upgradeParts&&App.previewCar.upgradeParts.children.length));
await ev(()=>{Menu.drawer(null);App.previewSpin=Math.PI*0.25;});await page.waitForTimeout(2000);await page.screenshot({path:SP0+'p6-'+name+'-parts.png',timeout:120000});
// race once: head-to-head recorded
await ev(()=>Career.startRace(null));await page.waitForTimeout(8000);
console.log(' race parts',await ev(()=>App.session.race.player.mesh.upgradeParts&&App.session.race.player.mesh.upgradeParts.children.length));
await ev(()=>{const r=App.session.race;r.lightsT=99;const ai=new SIM.AIDriver(r.player,1.0,3);let n=0;while(!r.player.finished&&n<360*900){r.step(1/360,ai.control(1/360,r.cars,r));n++;}App.handleEvents(r);});
for(let k=0;k<20&&await ev(()=>document.querySelector('#results').hidden);k++)await page.waitForTimeout(1000);
await ev(()=>document.querySelector('#r-again').click());await page.waitForTimeout(2000);
console.log(' h2h after race',JSON.stringify(await ev(()=>({h2h:Career.data.h2h,last:Career.data.last}))));
// jump to season end: offers
await ev(()=>{Career.data.round=Career.data.calendar.length;Career.data.points[Career.data.code]=180;Career.render();Menu.drawer('career');});await page.waitForTimeout(800);
console.log(' offers',JSON.stringify(await ev(()=>Career.data.offers.map(o=>o.team+' '+o.role+' '+o.years+'y'))));
await ev(()=>{const el=document.querySelector('.offers');el&&el.scrollIntoView();});await page.waitForTimeout(400);await page.screenshot({path:SP0+'p6-'+name+'-offers.png',timeout:120000});
const before=await ev(()=>Career.data.teamId);await ev(()=>document.querySelector('[data-offer="0"]').click());await page.waitForTimeout(1500);
console.log(' signed',before,'->',await ev(()=>Career.data.teamId),'season',await ev(()=>Career.data.season),'rd reset',await ev(()=>JSON.stringify(Career.data.rd)),'new rival',await ev(()=>Career.data.rival));
await ev(()=>{const el=document.querySelector('.rival');el&&el.scrollIntoView();});await page.waitForTimeout(300);await page.screenshot({path:SP0+'p6-'+name+'-hub.png',timeout:120000});
console.log(' errs',errs);await ctx.close();}
await br.close();})();
