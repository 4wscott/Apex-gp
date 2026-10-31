// v3 Phase 3: safety car (deploy, queue, no overtaking, restart), penalties, visible damage + debris; PC + iPhone
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,vp,touch] of [['pc',{width:1280,height:720},false],['iphone',{width:844,height:390},true]]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:7,mode:'race',track:'silver',camera:'chase',opponents:9,laps:8,radio:'text',grid:'mid'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
const r=await ev(()=>{const r=App.session.race,P=r.player;r.lightsT=99;const ai=new SIM.AIDriver(P,0.97,3);const step=(sec)=>{for(let n=0;n<360*sec;n++)r.step(1/360,ai.control(1/360,r.cars,r));App.handleEvents(r);};
  step(70);const out={};const spread0=(()=>{const st=r.standings();return Math.round(st[0].dist-st[st.length-1].dist);})();
  r.deploySC();App.handleEvents(r);out.deployed=!!r.sc;out.spreadBefore=spread0;
  const ord0=r.standings().map(c=>c.driver.code).join();let overt=0,prev=r.standings().map(c=>c.driver.code);
  for(let k=0;k<200;k++){step(2);const now=r.standings().filter(c=>!c.pit).map(c=>c.driver.code);if(r.sc){/*count AI swaps*/for(let i=0;i<now.length-1;i++){const a=prev.indexOf(now[i]),b=prev.indexOf(now[i+1]);if(a>b&&a>=0&&b>=0)overt++;}}prev=now;if(k===18){out.spreadUnderSC=(()=>{const st=r.standings().filter(c=>!c.pit);return Math.round(st[0].dist-st[st.length-1].dist);})();out.scAheadOfLeader=Math.round(r.sc?r.sc.dist-r.standings()[0].dist:-1);out.scSpeed=r.sc&&Math.round(r.sc.v*3.6);}if(!r.sc){out.endedAfter=(k+1)*2+' s';break;}}
  out.aiSwapsUnderSC=overt;
  return out;});
console.log(name,'safety car',JSON.stringify(r));
console.log(' HUD under SC',await ev(()=>{const r=App.session.race;r.deploySC();App.handleEvents(r);for(let k=0;k<8;k++)App.frame(performance.now()+k*100+1000);return document.querySelector('#h-vsc').textContent+' | banner: '+(document.querySelector('#banner')||{}).textContent;}));await page.waitForTimeout(1500);await page.screenshot({path:SP0+'v3p3-'+name+'-sc.png',timeout:180000});
// player overtakes under SC -> penalty
console.log(' overtake penalty',JSON.stringify(await ev(()=>{const r=App.session.race,P=r.player;r.deploySC();App.handleEvents(r);r.step(1/360,{steer:0,throttle:0,brake:0});const st=r.sc.order;const k=st.indexOf(P);if(k<=0)return 'player leads';const a=st[k-1];P.dist=a.dist+5;r.step(1/360,{steer:0,throttle:0,brake:0});App.handleEvents(r);return {pen:P.penalty,why:P.penalties};})));
// damage + debris on the player
await ev(()=>{const r=App.session.race,P=r.player;P.wingHealth=0.3;P.impact=25;App.spawnDebris(P);App.spawnDebris(P);App.session.camMode='chase';});await page.waitForTimeout(2500);
console.log(' damage parts',await ev(()=>{const m=App.session.race.player.mesh;return {dmgVisible:!!(m.dmg&&m.dmg.g.visible),debris:App.debris&&App.debris.shard.count,scMesh:!!(App.sc&&App.sc.grp.visible)};}));
await ev(()=>{App.session.camMode='far';});await page.waitForTimeout(2000);await page.screenshot({path:SP0+'v3p3-'+name+'.png',timeout:180000});
// reset in a race doesn't repair; reset in practice would. Pit repairs: wingHealth -> 1 after a stop is tested in pits.js
console.log(' errs',errs);await ctx.close();}
await br.close();})();
