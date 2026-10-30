// Full walkthrough: screenshots of every screen on PC and phone, plus basic layout checks.
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';const OUT=SP0+'walk/';fs.mkdirSync(OUT,{recursive:true});
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
const part=process.argv[2]||'pc';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const phone=part==='phone';
const ctx=await br.newContext(phone?{viewport:{width:844,height:390},hasTouch:true,isMobile:true}:{viewport:{width:1280,height:720}});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/googlevideo|favicon|ERR_|403/.test(m.text()))errs.push('console: '+m.text().slice(0,160));});
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
const q=+(process.argv[3]||0);
await page.addInitScript((q)=>{if(!localStorage.getItem('apexgp.settings'))localStorage.setItem('apexgp.settings',JSON.stringify({quality:q,v:3,mode:'race',track:'silver',opponents:7,laps:3,camera:'cockpit'}))},q);
await page.goto('http://local/');await page.waitForTimeout(7000);
const ev=(f,a)=>page.evaluate(f,a);let n=0;
const shot=async(name,note)=>{n++;const f=OUT+part+'-'+String(n).padStart(2,'0')+'-'+name+'.png';await page.screenshot({path:f,timeout:180000});
  const lay=await ev(()=>{const over=[];document.querySelectorAll('button,input,select,.pick,#hud *').forEach(el=>{if(!el.offsetParent)return;const r=el.getBoundingClientRect();if(r.width&&(r.right>innerWidth+1||r.left<-1||r.bottom>innerHeight+1&&!el.closest('.menu-inner,.overlay,.table-wrap')))over.push((el.id||el.className||el.tagName)+'');});return {hscroll:document.documentElement.scrollWidth>innerWidth,offscreen:[...new Set(over)].slice(0,6)};});
  console.log(String(n).padStart(2),name.padEnd(18),note||'',lay.hscroll?'HSCROLL':'',lay.offscreen.length?'offscreen:'+lay.offscreen.join(','):'');};
const click=(sel)=>ev((s)=>{const e=document.querySelector(s);if(!e)throw new Error('missing '+s);e.click();},sel);
const wait=(ms)=>page.waitForTimeout(ms);
// ---- menu ----
await shot('menu');
await click('#pick-circuit .pick-body');await wait(500);await shot('circuits');
await click('#drawer-close');await click('#pick-team .pick-body');await wait(500);await shot('teams');
await click('#drawer-close');
if(!phone){await click('#open-opts');await wait(400);await shot('race-opts');await click('#drawer-close');}
await click('#m-gear');await wait(400);await shot('set-driving');
await click('.tab[data-panel="p-controls"]');await wait(300);await shot('set-controls');
await click('.tab[data-panel="p-gfx"]');await wait(300);await shot('set-gfx-sound');
await ev(()=>document.querySelector('.menu-inner').scrollTop=9999);await wait(300);await shot('set-gfx-bottom');
await click('#drawer-close');
await click('.modes [data-v="career"]');await wait(700);await shot('career-new');
await ev(()=>document.querySelector('#cr-start')&&document.querySelector('#cr-start').click());await wait(1500);await shot('career-hub');
await click('.modes [data-v="online"]');await wait(700);await shot('online');
await click('#drawer-close');await click('.modes [data-v="race"]');await wait(400);
if(process.argv[4]==='menu'){console.log('errors',errs.length?errs:'none');await br.close();return;}
// ---- grand prix ----
await click('#start');await wait(1500);await shot('loading');await wait(5000);
await shot('grid-lights','phase '+await ev(()=>App.session.race.phase));
await ev(()=>{App.session.race.lightsT=99;});await wait(4000);
const cams=['cockpit','tcam','chase','far'];
for(const c of cams){await ev((c)=>{App.session.camMode=c;},c);await wait(2500);await shot('cam-'+c,'kmh '+await ev(()=>Math.round(App.session.race.player.vx*3.6)));}
// pit stop
await ev(()=>{const r=App.session.race,P=r.player,T=r.track;const d0=P.dist;P.place((r.pit.a-25+T.n)%T.n,0,40);P.dist=d0;P.lastS=P.s;App.session.camMode='chase';});
await page.keyboard.press('m');await wait(300);
let ph='';for(let k=0;k<40;k++){ph=await ev(()=>{const P=App.session.race.player;return P.pit&&P.pit.phase;});if(ph==='stop')break;await wait(700);}
await wait(800);await shot('pit-stop','phase '+ph);
for(let k=0;k<40;k++){ph=await ev(()=>{const P=App.session.race.player;return P.pit?P.pit.phase:'track';});if(ph==='track'||ph==='out')break;await wait(700);}
await shot('pit-release','phase '+ph);
// pause + settings
await page.keyboard.press('Escape');await wait(500);await shot('pause');
await click('#p-settings');await wait(500);await shot('pause-settings');await click('#drawer-close');await wait(300);
await click('#p-resume');await wait(500);
// results: run the race out
await ev(()=>{const r=App.session.race;const ai=new SIM.AIDriver(r.player,1.0,11);let k=0;while(!r.player.finished&&k<360*900){r.step(1/360,ai.control(1/360,r.cars,r));k++;}App.handleEvents(r);});
await wait(6000);await shot('results',await ev(()=>document.querySelector('#res-title')&&document.querySelector('#res-title').textContent));
await click('#r-menu');await wait(2500);
// ---- wet practice ----
await ev(()=>{SIM.settings.mode='practice';SIM.settings.weather='wet';SIM.settings.track='riviera';SIM.settings.traffic=3;SIM.settings.compound='W';App.start();});await wait(8000);
await ev(()=>{App.session.camMode='chase';});await wait(3000);await shot('practice-wet-chase');
await ev(()=>{App.session.camMode='cockpit';});await wait(2500);await shot('practice-wet-cockpit');
await ev(()=>App.quit());await wait(2000);
// ---- time trial ----
await ev(()=>{SIM.settings.mode='trial';SIM.settings.weather='dry';SIM.settings.track='ardenne';App.start();});await wait(8000);
await ev(()=>{App.session.camMode='tcam';});await wait(3000);await shot('trial-tcam');
await ev(()=>App.quit());await wait(2500);await shot('menu-after');
console.log('errors',errs.length?errs.slice(0,8):'none');await br.close();})();
