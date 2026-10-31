// v3 Phase 6: new circuits lap cleanly, livery editor reaches the showroom and race car, sprint weekend Sprint -> GP with 8..1 points; PC + iPhone
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
// circuits with the AI (node)
{const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');const m={exports:{}};new Function('module',src+'\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS};')(m);const S=m.exports;
 for(const id of ['montealto','lakeside']){const T=S.buildTrack(S.TRACKS.find(t=>t.id===id));const race=new S.Race(T,{mode:'race',laps:2,opponents:9,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],assist:{tc:2,abs:true,autoGear:true}});race.lightsT=99;
  const ai=new S.AIDriver(race.player,1.0,3);let n=0;while(race.finishOrder.length<race.cars.length&&n<360*400){race.step(1/360,ai.control(1/360,race.cars,race));n++;}
  console.log(id,'length',T.length.toFixed(0),'finished',race.finishOrder.length+'/'+race.cars.length,'best lap',Math.min(...race.cars.flatMap(c=>c.lapTimes)).toFixed(1),'s');}}
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,vp,touch] of [['pc',{width:1280,height:720},false],['iphone',{width:390,height:844},true]]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:7,mode:'career'}));localStorage.removeItem('apexgp.career');});
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{document.querySelector('#cr-start').click();});await page.waitForTimeout(1500);
console.log(name,'calendar',await ev(()=>Career.data.calendar.length+' rounds, sprints at rounds '+Career.data.sprints.map(r=>r+1).join(', ')));
// livery: purple / gold / white, reversed, matte
await ev(()=>{const set=(id,v)=>{const e=document.querySelector(id);e.value=v;e.dispatchEvent(new Event('input'));};set('#lv-c1','#5a1fb0');set('#lv-c2','#f2c200');set('#lv-c3','#ffffff');document.querySelector('#lv-pattern [data-v="reversed"]').click();document.querySelector('#lv-finish [data-v="matte"]').click();});
await page.waitForTimeout(2500);
console.log(' livery',JSON.stringify(await ev(()=>({saved:Career.data.livery,used:Career.livery()}))));
await ev(()=>{document.querySelector('.livery-ed').scrollIntoView();});await page.screenshot({path:SP0+'v3p6-'+name+'-livery.png',timeout:120000});
await ev(()=>Menu.drawer(null));await page.waitForTimeout(1500);await page.screenshot({path:SP0+'v3p6-'+name+'-car.png',timeout:120000});
// jump to a sprint round
await ev(()=>{Career.data.round=Career.data.sprints[0];Career.save();Career.render();Menu.drawer('career');});await page.waitForTimeout(600);
console.log(' sprint hub',JSON.stringify(await ev(()=>({tag:(document.querySelector('.sprint-tag')||{}).textContent,sprintBtn:!!document.querySelector('#cr-sprint'),qualiBtn:!!document.querySelector('#cr-quali')}))));
await ev(()=>document.querySelector('#cr-sprint').click());await page.waitForTimeout(8000);
console.log(' sprint session',JSON.stringify(await ev(()=>({sprint:App.cfg.sprint,laps:App.session.race.laps,liveryOnCar:!!App.cfg.livery}))));
const ptsBefore=await ev(()=>Career.data.points[Career.data.code]||0);
await ev(()=>{const r=App.session.race;r.lightsT=99;const ai=new SIM.AIDriver(r.player,1.0,3);let n=0;while(!r.player.finished&&n<360*600){r.step(1/360,ai.control(1/360,r.cars,r));n++;}App.handleEvents(r);App.session.finishedAt=performance.now()-7000;});
for(let k=0;k<20&&await ev(()=>document.querySelector('#results').hidden);k++)await page.waitForTimeout(1000);
console.log(' sprint result',await ev(()=>document.querySelector('#res-title').textContent+' | button: '+document.querySelector('#r-again').textContent),'points',ptsBefore,'->',await ev(()=>Career.data.points[Career.data.code]||0),'round still',await ev(()=>Career.data.round));
await ev(()=>document.querySelector('#r-again').click());await page.waitForTimeout(1500);
console.log(' after sprint hub',JSON.stringify(await ev(()=>({sprintBtn:!!document.querySelector('#cr-sprint'),qualiBtn:!!document.querySelector('#cr-quali'),note:[...document.querySelectorAll('#career .hint')].map(e=>e.textContent).find(t=>t.startsWith('Sprint'))}))));
console.log(' errs',errs);await ctx.close();}
await br.close();})();
