const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,vp,touch] of [['iphone',{width:844,height:390},true],['pc',{width:1280,height:720},false]]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:7,mode:'practice',track:'riviera',camera:'chase'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
await ev(()=>{const r=App.session.race,P=r.player;const ai=new SIM.AIDriver(P,0.95,3);let n=0;while(P.lap<7&&n<360*900){const c=ai.control(1/360,r.cars,r);if(P.lap===3&&(r.time%80)<1)c.steer=1;r.step(1/360,c);n++;}App.handleEvents(r);Hud.t=1;Hud.update(0.1,App.session,{});});
console.log(name,'HUD lap:',await ev(()=>document.querySelector('#h-lap').textContent));
await ev(()=>App.togglePause(true));await page.waitForTimeout(600);
console.log(' lap list:',await ev(()=>[...document.querySelectorAll('#p-laps li')].map(li=>li.textContent.replace(/(Lap \d+)/,'$1 ')).join(' | ')));
await page.screenshot({path:SP0+'praclaps-'+name+'.png',timeout:180000});
// replay trimming: pretend 41 minutes have been recorded
if(!touch)console.log(' replay trim:',await ev(()=>{const R=Replay.rec;const n0=R.times.length;for(let k=0;k<20*60*41;k++){R.last=-1;Replay.sample({...App.session.race,time:1000+k/20,mode:'practice',cars:App.session.race.cars,phase:'green',standings:()=>[]});}return `${n0} -> ${R.times.length} samples, spans ${((R.times.at(-1)-R.times[0])/60).toFixed(1)} min`;}));
console.log(' errs',errs);await ctx.close();}
await br.close();})();
