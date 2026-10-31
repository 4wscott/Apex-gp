// Phase 3: Grand Prix weekend (qualifying -> race from that grid), car setup in the physics, team radio; PC + iPhone
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,vp,touch] of [['pc',{width:1280,height:720},false],['iphone',{width:844,height:390},true]]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:6,mode:'race',track:'silver',camera:'chase',laps:2,opponents:7,radio:'text'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
// open race settings (on a narrow phone it is in the pickers row too)
await ev(()=>Menu.drawer('opts'));await page.waitForTimeout(400);
await ev(()=>{document.querySelector('[data-set="weekend"] [data-v="quali"]').click();document.querySelector('[data-set="setupPress"] [data-v="low"]').click();document.querySelector('[data-set="setupGear"] [data-v="long"]').click();const w=document.querySelector('#su-wing');w.value=-3;w.dispatchEvent(new Event('input'));const b=document.querySelector('#su-bias');b.value=58;b.dispatchEvent(new Event('input'));});
await page.waitForTimeout(300);
console.log(name,'menu',JSON.stringify(await ev(()=>({start:document.querySelector('#start').textContent,sum:document.querySelector('#opts-sum').textContent,effect:document.querySelector('#su-effect').textContent,gridRowHidden:document.querySelector('[data-set="grid"]').closest('.row').hidden}))));
await ev(()=>document.querySelector('#setup').scrollIntoView());await page.waitForTimeout(300);
await page.screenshot({path:SP0+'p3-'+name+'-setup.png',timeout:120000});
await ev(()=>{Menu.drawer(null);document.querySelector('#start').click();});await page.waitForTimeout(7000);
console.log(' quali session',JSON.stringify(await ev(()=>({mode:App.session.race.mode,quali:App.session.race.quali,gp:App.cfg&&App.cfg.gp,ClA:App.session.race.player.p.ClA.toFixed(3),bias:App.session.race.player.bias,gear8:App.session.race.player.p.gears[7].toFixed(0),wear:App.session.race.player.setupWear}))));
await ev(()=>{const r=App.session.race;r.lightsT=99;const ai=new SIM.AIDriver(r.player,1.0,3);let n=0;while(r.player.lapTimes.length<2&&n<360*400){r.step(1/360,ai.control(1/360,r.cars,r));n++;}App.handleEvents(r);});
for(let k=0;k<20&&await ev(()=>document.querySelector('#results').hidden);k++)await page.waitForTimeout(800);
const qres=await ev(()=>({title:document.querySelector('#res-title').textContent,rows:document.querySelectorAll('#res-body tr').length,btn:document.querySelector('#r-again').textContent,grid:Weekend.pendingGrid.length}));
console.log(' quali results',JSON.stringify(qres));
await page.screenshot({path:SP0+'p3-'+name+'-quali.png',timeout:120000});
await ev(()=>document.querySelector('#r-again').click());await page.waitForTimeout(8000);
const rs=await ev(()=>{const r=App.session.race,P=r.player;return {mode:r.mode,cars:r.cars.length,gridPos:P.gridPos,expect:Weekend.pendingGrid.indexOf(P.driver.code)+1,ClA:P.p.ClA.toFixed(3)};});
console.log(' race',JSON.stringify(rs));
// radio: lights out + a lap
await ev(()=>{const r=App.session.race;r.lightsT=99;});await page.waitForTimeout(3000);
console.log(' radio at start',await ev(()=>document.querySelector('#radio').hidden?'(hidden)':document.querySelector('#radio-text').textContent));
await page.screenshot({path:SP0+'p3-'+name+'-radio.png',timeout:120000});
await ev(()=>{const r=App.session.race;const ai=new SIM.AIDriver(r.player,0.97,3);let n=0;while(r.player.lap<2&&n<360*200){r.step(1/360,ai.control(1/360,r.cars,r));n++;}App.handleEvents(r);});
await page.waitForTimeout(6000);
console.log(' radio after lap 1',await ev(()=>document.querySelector('#radio').hidden?'(hidden) queue='+Radio.q.join(' | '):document.querySelector('#radio-text').textContent));
console.log(' errs',errs);await ctx.close();}
await br.close();})();
