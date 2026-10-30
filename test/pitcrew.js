const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await br.newPage({viewport:{width:960,height:540}});
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{try{localStorage.setItem('apexgp.settings','{"quality":1,"mirrors":false,"v":3,"camera":"chase","laps":10}')}catch(e){}});
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>{SIM.settings.mode='race';SIM.settings.track='parco';SIM.settings.opponents=5;SIM.settings.laps=10;SIM.settings.camera='chase';App.start();});await page.waitForTimeout(6000);
await page.evaluate(()=>{const r=App.session.race;r.lightsT=99;});await page.waitForTimeout(1500);
// put the player just before pit entry and press M
await page.evaluate(()=>{const r=App.session.race,P=r.player,T=r.track;const d0=P.dist;P.place((r.pit.a-25+T.n)%T.n,0,40);P.dist=d0;P.lastS=P.s;});
await page.keyboard.press('m');
await page.waitForFunction(()=>{const P=App.session.race.player;return P.pit&&P.pit.phase==='in';},null,{timeout:120000});
await page.screenshot({path:SP+'pl-entry.png',timeout:120000});
await page.evaluate(()=>{const r=App.session.race,q=r.player.pit;q.s=q.box-30;q.v=22;});await page.waitForTimeout(1500);await page.screenshot({path:SP+'pl-lane.png',timeout:120000});
await page.evaluate(()=>{const r=App.session.race,q=r.player.pit;q.s=q.box-0.5;q.v=0.3;});
await page.waitForFunction(()=>{const P=App.session.race.player;return P.pit&&P.pit.phase==='stop';},null,{timeout:60000});
// freeze the stop at several moments of the service and photograph it
await page.evaluate(()=>{const r=App.session.race;r.__step=r.__step||r.step;r.step=function(dt,i){const q=this.player.pit;if(q&&q.phase==='stop'){q.t=window.__freeze;return;}return this.__step(dt,i);};});
for (const [k,t,view] of [[0,0.2,'top'],[1,0.8,'side'],[2,1.4,'tv'],[3,2.3,'front']]) {
  await page.evaluate(([t,view])=>{const q=App.session.race.player.pit;q.service=2.6;q.t=t;window.__freeze=t;PitCrew.crews.forEach(c=>c.ready=1);
    const G=GFX.pit,b=q.box,cam=App.camera;
    const V={top:[[b,G.P.workDist,14],[b+0.01,G.P.workDist,0]],side:[[b-1,G.P.workDist-6,1.4],[b,G.P.workDist,0.5]],tv:[[b+7.5,G.P.workDist-5.5,2.4],[b-0.4,G.P.workDist+0.8,0.6]],front:[[b+6,G.P.workDist,1.2],[b,G.P.workDist,0.5]]}[view];
    window.__cam=V;},[t,view]);
  await page.evaluate(()=>{App.__render=App.__render||App.render;App.render=function(c){const V=window.__cam,G=GFX.pit;if(V){this.camera.position.copy(G.at(...V[0]));this.camera.up.set(0,1,0);if(V[0][2]>10)this.camera.up.set(1,0,0);this.camera.lookAt(G.at(...V[1]));this.camera.fov=50;this.camera.updateProjectionMatrix();}return this.__render(c);};});
  await page.waitForTimeout(2500); await page.screenshot({path:SP+'crew'+k+'.png',timeout:120000}); }
console.log(await page.evaluate(()=>({crews:PitCrew.crews.length,people:PitCrew.crews[0]&&PitCrew.crews[0].people.length})));
console.log('errs',errs);await br.close();})();