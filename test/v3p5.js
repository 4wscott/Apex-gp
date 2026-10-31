// v3 Phase 5: two real players (PC host + iPhone guest) through the PeerJS broker: lobby, shared settings, race, drop-out, rematch
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
const args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-features=WebRtcHideLocalIpsWithMdns'];
async function player(name,team,vp,touch,pre){const br=await chromium.launch({args});const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();page.errs=[];page.on('pageerror',e=>page.errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((p)=>{localStorage.setItem('apexgp.settings',JSON.stringify(p))},Object.assign({quality:0,v:7,camera:'chase',mode:'online',laps:2,radio:'text'},pre,{team}));
await page.goto('http://local/');await page.waitForTimeout(7000);await page.evaluate((n)=>{document.querySelector('#on-name').value=n;},name);page.br=br;return page;}
(async()=>{
const A=await player('Scott','taurus',{width:1280,height:720},false,{track:'silver',tod:'night',weather:'dry'});
const B=await player('Friend','rossa',{width:844,height:390},true,{track:'parco',tod:'day'});
console.log('peerjs',await A.evaluate(()=>Net.available()));
await A.evaluate(()=>document.querySelector('#on-create').click());await A.waitForFunction(()=>Net.code&&Net.me,null,{timeout:30000});const code=await A.evaluate(()=>Net.code);
await B.evaluate((c)=>{document.querySelector('#on-code').value=c;document.querySelector('#on-join').click();},code);await B.waitForFunction(()=>Net.me,null,{timeout:30000});
await A.waitForFunction(()=>Net.players.length===2,null,{timeout:20000});await B.waitForTimeout(1500);
const lob=(P)=>P.evaluate(()=>({players:[...document.querySelectorAll('#on-players li')].map(li=>li.textContent),cfg:document.querySelector('#on-cfg').textContent}));
console.log('host lobby',JSON.stringify(await lob(A)));console.log('guest lobby',JSON.stringify(await lob(B)));
await A.screenshot({path:SP+'v3p5-host-lobby.png',timeout:120000});await B.screenshot({path:SP+'v3p5-guest-lobby.png',timeout:120000});
// host changes laps -> guest lobby updates
await A.evaluate(()=>{SIM.settings.laps=3;Menu.sync();});await B.waitForTimeout(1500);console.log('guest sees laps change:',(await lob(B)).cfg);
await A.evaluate(()=>document.querySelector('#on-start').click());
await A.waitForFunction(()=>App.session&&App.session.online,null,{timeout:60000});await B.waitForFunction(()=>App.session&&App.session.online,null,{timeout:60000});
const sess=(P)=>P.evaluate(()=>({track:App.session.race.track.spec.id,tod:App.cfg.tod,night:App.isNight,cars:App.session.race.cars.length,remote:App.session.race.cars.filter(c=>c.remote).map(c=>c.driver.name)}));
console.log('host session',JSON.stringify(await sess(A)));console.log('guest session',JSON.stringify(await sess(B)));
// wait for lights out on both, then drive the host's car forward and check the guest sees it move
await A.evaluate(()=>{App.session.race.lightsT=99;});await B.evaluate(()=>{App.session.race.lightsT=99;});await A.waitForFunction(()=>App.session.race.phase==='green',null,{timeout:90000});
const before=await B.evaluate(()=>{const c=App.session.race.cars.find(c=>c.remote);return [c.x,c.y];});
await A.evaluate(()=>{App.input.keys.add('KeyA');});await A.waitForTimeout(6000);await A.evaluate(()=>App.input.keys.clear());
const after=await B.evaluate(()=>{const c=App.session.race.cars.find(c=>c.remote);return [c.x,c.y,Math.round(c.vx*3.6)];});
const hostP=await A.evaluate(()=>{const P=App.session.race.player;return [P.x,P.y];});
console.log('guest sees host car move',Math.hypot(after[0]-before[0],after[1]-before[1]).toFixed(1),'m, at',after[2],'km/h; distance from host\'s own position',Math.hypot(after[0]-hostP[0],after[1]-hostP[1]).toFixed(1),'m');
await B.screenshot({path:SP+'v3p5-guest-race.png',timeout:120000});
// guest drops out -> host's AI takes over that car
await B.br.close();
await A.waitForTimeout(9000);
console.log('host after guest dropped',JSON.stringify(await A.evaluate(()=>({remote:App.session.race.cars.filter(c=>c.remote).length,aiCars:App.session.race.ais.length,flash:document.querySelector('#flash').textContent}))));
// finish the host race fast and check the results screen offers a rematch
await A.evaluate(()=>{const r=App.session.race;const ai=new SIM.AIDriver(r.player,1.0,3);let n=0;while(!r.player.finished&&n<360*400){r.step(1/360,ai.control(1/360,r.cars,r));n++;}App.handleEvents(r);App.session.finishedAt=performance.now()-7000;});
await A.waitForFunction(()=>!document.querySelector('#results').hidden,null,{timeout:60000});
console.log('host results',JSON.stringify(await A.evaluate(()=>({again:document.querySelector('#r-again').textContent,againShown:!document.querySelector('#r-again').hidden,replay:!document.querySelector('#r-replay').hidden}))));
await A.evaluate(()=>document.querySelector('#r-again').click());await A.waitForFunction(()=>App.session&&App.session.online&&App.session.race.time<5,null,{timeout:60000});
console.log('rematch started for host:',await A.evaluate(()=>App.session.race.cars.length+' car(s)'));
console.log('errs host',A.errs,'guest',B.errs);await A.br.close();})().catch(e=>{console.log('TEST ERROR',e.message);process.exit(1);});
