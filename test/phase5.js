// Phase 5: grandstand detail, giant screen (menu logo + live timing), the two new circuits; PC + iPhone
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const run=async(name,vp,touch,pre,fn)=>{const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((p)=>{localStorage.setItem('apexgp.settings',JSON.stringify(Object.assign({quality:0,v:6,mode:'race',track:'silver',camera:'chase',laps:1,opponents:7},p)))},pre);
await page.goto('http://local/');await page.waitForTimeout(6000);
await fn(page,(f,a)=>page.evaluate(f,a));console.log(name,'errs',errs);await ctx.close();};
const shot=(page,f)=>page.screenshot({path:SP0+'p5-'+f+'.png',timeout:240000});
await run('stand-pc',{width:1280,height:720},false,{},async(page,ev)=>{
  // TV view of the main stand from across the track
  await ev(()=>{window.DEBUG_CAM=null;});await page.waitForTimeout(500);await shot(page,'menu-pc');
  await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
  await ev(()=>{const r=App.session.race;r.lightsT=99;const ai=new SIM.AIDriver(r.player,0.97,3);for(let n=0;n<360*6;n++)r.step(1/360,ai.control(1/360,r.cars,r));Replay.sample(r);App.handleEvents(r);});
  // pause and look at the stand + screen with the replay heli/TV camera
  await ev(()=>{App.togglePause(true);Replay.open('pause');Replay.camMode='heli';Replay.playing=false;});await page.waitForTimeout(3000);await shot(page,'stand-heli-pc');
  console.log(' screen',await ev(()=>!!GFX.bigScreen));
  await ev(()=>{const S=GFX.mainStand,T=App.session.race.track,i=S.mid;const o=(S.lat+30);Replay.close();App.togglePause(false);App.session.camMode='far';window.__cam=[T.px[i]-T.nx[i]*25,7,-(T.py[i]-T.ny[i]*25),T.px[i]+T.nx[i]*o,8,-(T.py[i]+T.ny[i]*o)];
    const orig=App.render.bind(App);App.render=function(){const c=App.camera,k=window.__cam;c.position.set(k[0],k[1],k[2]);c.lookAt(k[3],k[4],k[5]);c.fov=60;c.updateProjectionMatrix();orig();};App.togglePause(true);document.querySelector('#pause').hidden=true;});
  await page.waitForTimeout(3000);await shot(page,'stand-front-pc');
});
for(const t of ['baia','nordhang']) await run(t+'-iphone',{width:844,height:390},true,{track:t},async(page,ev)=>{
  await page.waitForTimeout(1500);await shot(page,t+'-menu-iphone');
  await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);await ev(()=>{App.session.race.lightsT=99;});
  await ev(()=>{const r=App.session.race;const ai=new SIM.AIDriver(r.player,0.97,3);let n=0;while(r.player.lap<2&&n<360*150){r.step(1/360,ai.control(1/360,r.cars,r));n++;}App.handleEvents(r);});
  console.log(' '+t,JSON.stringify(await ev(()=>{const r=App.session.race,P=r.player;return {lap:P.lap,lapTime:P.lapTimes[0]&&P.lapTimes[0].toFixed(1),len:r.track.length.toFixed(0)};})));
  await page.waitForTimeout(2500);await shot(page,t+'-race-iphone');
});
await br.close();})();
