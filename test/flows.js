// End-to-end flow tests in a headless browser (software WebGL)
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
const which=process.argv[2]||'all';
(async()=>{
 const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const mob=process.env.MOBILE;
 const page=await br.newPage(mob?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:720}});
 const errs=[];page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));page.on('console',m=>{if(m.type()==='error'&&!/status of 403/.test(m.text()))errs.push('console: '+m.text())});
 await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
 await page.addInitScript(p=>{try{localStorage.setItem('apexgp.settings',p)}catch(e){}},process.env.PRE||'{"quality":0,"mirrors":false,"v":3}');
 await page.goto('http://local/');await page.waitForTimeout(2500);
 const ev=(f,a)=>page.evaluate(f,a);
 const log=(...a)=>console.log(...a);
 const waitFor=async(fn,ms=120000,arg)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await ev(fn,arg))return true;await page.waitForTimeout(500);}return false;};
 // run the player's car with an AI until it finishes (fast-forward, synchronous)
 const autoRace=()=>ev(()=>{const S=App.session,r=S.race;r.lightsOutAt=0;const ai=new SIM.AIDriver(r.player,1.0,11);let n=0;
   while(!r.player.finished&&n<360*900){r.step(1/360,ai.control(1/360,r.cars,r));n++;}
   App.handleEvents(r);return {finished:r.player.finished,simT:r.time.toFixed(0),pos:r.finishOrder.indexOf(r.player)+1};});
 try{
 if(which==='all'||which==='career'){
  log('== career');
  await ev(()=>{SIM.settings.mode='career';Career.retire();Menu.sync();});
  await ev(()=>{Career.newCareer({name:'Test Driver',num:42,team:'grove',replaces:'SIN',laps:1});});
  log('career created',await ev(()=>({code:Career.data.code,team:Career.data.teamId,round:Career.data.round,rd:Career.data.rd.points})));
  await ev(()=>Career.startRace(null));
  await waitFor(()=>!!(App.session&&App.session.race&&App.session.race.mode==='race'));
  log('race started',await ev(()=>({grid:App.session.race.player.gridPos,name:App.session.race.player.driver.name,laps:App.session.race.laps})));
  log('auto race',await autoRace());
  const shown=await waitFor(()=>!document.querySelector('#results').hidden,30000);
  log('results shown',shown,await ev(()=>({title:document.querySelector('#res-title').textContent,btn:document.querySelector('#r-again').textContent})));
  await page.screenshot({path:SP+'f_results.png',timeout:180000});
  await page.click('#r-again');await page.waitForTimeout(1500);
  log('after continue',await ev(()=>({round:Career.data.round,pts:Career.data.points[Career.data.code]||0,totalAwarded:Object.values(Career.data.points).reduce((a,b)=>a+b,0),teamPts:Career.data.teamPoints.grove||0,rd:Career.data.rd.points,menu:!document.querySelector('#menu').hidden,last:Career.data.last})));
  await page.screenshot({path:SP+'f_hub.png',timeout:180000});
  // development upgrade
  const before=await ev(()=>Career.data.rd.power);await ev(()=>Career.upgrade('power'));log('upgrade power',before,'->',await ev(()=>Career.data.rd.power));
  // jump to the last round, qualify, race, check season review
  await ev(()=>{Career.data.round=7;Career.save();Career.render();});
  await ev(()=>Career.startQuali());
  await waitFor(()=>!!(App.session&&App.session.race&&App.session.race.quali));
  log('quali running',await ev(()=>({track:App.session.race.track.spec.id,mode:App.session.race.mode})));
  await ev(()=>{const r=App.session.race;const ai=new SIM.AIDriver(r.player,1.0,3);let n=0;while(r.player.lapTimes.length<2&&n<360*400){r.step(1/360,ai.control(1/360,r.cars,r));n++;}App.handleEvents(r);});
  const q=await waitFor(()=>!document.querySelector('#results').hidden,20000);
  log('quali results shown',q,await ev(()=>document.querySelector('#res-title').textContent),'best',await ev(()=>App.session.race.player.bestLap.toFixed(3)));
  await page.screenshot({path:SP+'f_quali.png',timeout:180000});
  await page.click('#r-again');
  await waitFor(()=>!!(App.session&&App.session.race&&App.session.race.mode==='race'),60000);
  log('race from quali grid: P',await ev(()=>App.session.race.player.gridPos));
  log('auto race',await autoRace());
  await waitFor(()=>!document.querySelector('#results').hidden,30000);
  await page.click('#r-again');await page.waitForTimeout(1500);
  log('season done',await ev(()=>({round:Career.data.round,champ:(document.querySelector('.champ')||{}).textContent})));
  await page.screenshot({path:SP+'f_season.png',timeout:180000});
  await ev(()=>Career.nextSeason());
  log('next season',await ev(()=>({season:Career.data.season,round:Career.data.round,pts:Object.keys(Career.data.points).length,history:Career.data.history})));
 }
 if(which==='all'||which==='tracks'){
  log('== tracks');
  for(const id of await ev(()=>SIM.TRACKS.map(t=>t.id))){
   await ev((id)=>{if(App.session)App.quit();SIM.settings.mode='race';SIM.settings.track=id;SIM.settings.opponents=5;App.start();},id);
   const ok=await waitFor(()=>!!(App.session&&App.session.race),60000);
   await page.waitForTimeout(1500);
   const info=await ev(()=>({cars:App.session.race.cars.length,objs:(()=>{let n=0;App.worldRoot.traverse(()=>n++);return n})()}));
   log(id,ok?'loaded':'FAILED',JSON.stringify(info));
   if(id==='sakhir'||id==='riviera'||id==='ile'){await ev(()=>{App.session.camMode='chase';App.session.race.lightsOutAt=0;});await page.waitForTimeout(2500);await page.screenshot({path:SP+'f_'+id+'.png',timeout:180000});}
  }
 }
 if(which==='all'||which==='trial'){
  log('== time trial + ghost');
  await ev(()=>{if(App.session)App.quit();localStorage.removeItem('apexgp.tt.ile');SIM.settings.mode='trial';SIM.settings.track='ile';App.start();});
  await waitFor(()=>!!(App.session&&App.session.race));
  await ev(()=>{const S=App.session,r=S.race;const ai=new SIM.AIDriver(r.player,1.0,3);let n=0;
    while(r.player.lapTimes.length<2&&n<360*400){const inp=ai.control(1/360,r.cars,r);r.step(1/360,inp);App.ghostUpdate(1/360,r.player,r);App.handleEvents(r);n++;}});
  log('trial',await ev(()=>{const g=JSON.parse(localStorage.getItem('apexgp.tt.ile')||'null');return {laps:App.session.race.player.lapTimes.map(t=>t.toFixed(2)),saved:g&&g.time.toFixed(2),ghostSamples:g&&g.ghost.length/3};}));
 }
 if(which==='all'||which==='manual'){
  log('== manual gears + pause/restart/quit');
  await ev(()=>{if(App.session)App.quit();SIM.settings.mode='race';SIM.settings.track='parco';SIM.settings.autoGear=false;SIM.settings.opponents=3;App.start();});
  await waitFor(()=>!!(App.session&&App.session.race));
  await ev(()=>{App.session.race.lightsOutAt=0;});
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(3000);
  const g1=await ev(()=>App.session.race.player.gear);
  await page.keyboard.press('KeyE');await page.waitForTimeout(800);await page.keyboard.press('KeyE');await page.waitForTimeout(800);
  const g2=await ev(()=>App.session.race.player.gear);await page.keyboard.up('ArrowUp');
  log('manual gears',g1,'->',g2,'speed',await ev(()=>(App.session.race.player.vx*3.6).toFixed(0)));
  await page.keyboard.press('Escape');await waitFor(()=>App.paused,15000);
  log('paused',await ev(()=>({paused:App.paused,overlay:!document.querySelector('#pause').hidden})));
  await page.click('#p-restart');await waitFor(()=>!!(App.session&&App.session.race&&App.session.race.time<1),30000);
  log('restarted',await ev(()=>({t:App.session.race.time.toFixed(2),paused:App.paused})));
  await page.keyboard.press('Escape');await page.waitForTimeout(800);await page.click('#p-quit');await page.waitForTimeout(1000);
  log('quit to menu',await ev(()=>({session:!!App.session,menu:!document.querySelector('#menu').hidden})));
  await ev(()=>{SIM.settings.autoGear=true;});
 }
 if(which==='touch'){
  log('== touch arrows');
  await ev(()=>{SIM.settings.mode='race';SIM.settings.track='parco';SIM.settings.opponents=3;App.start();});
  await waitFor(()=>!!(App.session&&App.session.race));
  await ev(()=>{App.session.race.lightsOutAt=0;});
  const box=async(sel)=>{const b=await page.locator(sel).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
  const thr=await box('#t-thr'),lft=await box('#t-left');
  const cdp=await page.context().newCDPSession(page);
  const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map((p,i)=>({x:p.x,y:p.y,id:i}))});
  await touch('touchStart',[thr]);await page.waitForTimeout(3000);
  log('throttle by touch: speed',await ev(()=>(App.session.race.player.vx*3.6).toFixed(0)),'device',await ev(()=>App.input.lastDevice));
  await touch('touchStart',[thr,lft]);await page.waitForTimeout(1500);
  log('left arrow held: steer input',await ev(()=>App.input.state.steer.toFixed(3)),'front wheel angle',await ev(()=>App.session.race.player.delta.toFixed(3)));
  log('held: raw touch target',await ev(()=>App.input.touch.steer));
  await touch('touchEnd',[]);await page.waitForTimeout(300);
  log('released: raw touch target',await ev(()=>App.input.touch.steer),'arrow still pressed?',await ev(()=>document.querySelector('#t-left').classList.contains('down')));
  await page.waitForTimeout(6000);
  log('released +6s: steer',await ev(()=>App.input.state.steer.toFixed(3)));
 }
 }catch(e){log('TEST ERROR',e.message.split('\n')[0]);}
 log('errors:',errs.length?errs.slice(0,10).join('\n'):'none');
 await br.close();
})();
