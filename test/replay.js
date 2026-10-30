// Phase 2: record a race, open the replay from pause and from results, every camera, controls, highlights; PC + iPhone
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,vp,touch] of [['pc',{width:1280,height:720},false],['iphone',{width:844,height:390},true]]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:6,mode:'race',track:'silver',camera:'chase',laps:2,opponents:5}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(6000);
// fast-forward 40 s of racing, recording as the game does each frame
await ev(()=>{const r=App.session.race;r.lightsT=99;const ai=new SIM.AIDriver(r.player,0.97,3);for(let n=0;n<360*40;n++){r.step(1/360,ai.control(1/360,r.cars,r));if(n%18===0)Replay.sample(r);}App.handleEvents(r);});
console.log(name,'recorded',JSON.stringify(await ev(()=>({frames:Replay.rec.times.length,cars:Replay.rec.n,green:Replay.rec.green&&Replay.rec.green.toFixed(1)}))));
await ev(()=>App.togglePause(true));await page.waitForTimeout(300);
const live=await ev(()=>{const P=App.session.race.player;return [P.x,P.y,P.h,P.vx,P.s].map(v=>+v.toFixed(3));});
await ev(()=>document.querySelector('#p-replay').click());await page.waitForTimeout(1500);
const st=()=>ev(()=>({on:Replay.on,t:+Replay.t.toFixed(1),cam:Replay.camMode,shown:Replay.shown,car:document.querySelector('#rp-car').textContent,time:document.querySelector('#rp-time').textContent,playing:Replay.playing}));
console.log(' opened',JSON.stringify(await st()));
await page.screenshot({path:SP0+'rp-'+name+'-1.png',timeout:120000});
for(const m of ['tv','heli','onboard','chase']){await ev((m)=>{Replay.camMode=m;},m);await page.waitForTimeout(1200);await page.screenshot({path:SP0+'rp-'+name+'-'+m+'.png',timeout:120000});}
const clk=async(sel)=>{const b=await page.$(sel);const bb=await b.boundingBox();if(touch)await page.touchscreen.tap(bb.x+bb.width/2,bb.y+bb.height/2);else await page.mouse.click(bb.x+bb.width/2,bb.y+bb.height/2);await page.waitForTimeout(500);};
await clk('#rp-play');const a1=await st();await clk('#rp-back');const a2=await st();await clk('#rp-speed');await clk('#rp-next');await clk('#rp-cam');const a3=await st();
console.log(' controls pause',a1.playing,'back5',a2.t,'next car',a3.car,'cam',a3.cam,'speed',await ev(()=>Replay.speed));
await clk('#rp-exit');await page.waitForTimeout(600);
const after=await ev(()=>{const P=App.session.race.player;return [P.x,P.y,P.h,P.vx,P.s].map(v=>+v.toFixed(3));});
console.log(' live',JSON.stringify(live),'after',JSON.stringify(after));console.log(' exit -> pause card',await ev(()=>!document.querySelector('#pause').hidden),'live state restored',JSON.stringify(live)===JSON.stringify(after));
// finish the race, then highlights from the results
await ev(()=>App.togglePause(false));
await ev(()=>{const r=App.session.race;const ai=new SIM.AIDriver(r.player,1.0,3);let n=0;while(!r.player.finished&&n<360*500){r.step(1/360,ai.control(1/360,r.cars,r));if(n%18===0)Replay.sample(r);n++;}App.handleEvents(r);});
for(let k=0;k<30&&await ev(()=>document.querySelector('#results').hidden);k++)await page.waitForTimeout(1000);
console.log(' results; highlights button',await ev(()=>!document.querySelector('#r-high').hidden));
await ev(()=>document.querySelector('#r-high').click());await page.waitForTimeout(1500);
console.log(' highlights',JSON.stringify(await ev(()=>({clips:Replay.clips&&Replay.clips.map(c=>c.map(v=>+v.toFixed(0))),tag:document.querySelector('#rp-tag').textContent,marks:Replay.rec.marks.length}))));
await page.screenshot({path:SP0+'rp-'+name+'-high.png',timeout:120000});
await ev(()=>document.querySelector('#rp-exit').click());await page.waitForTimeout(500);
console.log(' back to results',await ev(()=>!document.querySelector('#results').hidden),'errs',errs);
await ctx.close();}
await br.close();})();
