const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await br.newPage({viewport:{width:640,height:360}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:7,mode:'practice',track:'riviera',camera:'chase',laps:3,traffic:3}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
for(let k=0;k<4;k++){const r=await page.evaluate(()=>{const S=App.session,r=S.race,P=r.player;const ai=new SIM.AIDriver(P,0.97,3);let n=0;const target=P.lap+3;while(P.lap<target&&n<360*400){r.step(1/360,ai.control(1/360,r.cars,r));if(n%18===0)Replay.sample(r);n++;}App.handleEvents(r);App.frame(performance.now()+16);Hud.t=1;Hud.update(0.1,S,{});
  return {lap:P.lap,hudLap:document.querySelector('#h-lap').textContent,results:!document.querySelector('#results').hidden,session:!!App.session,finished:P.finished,best:document.querySelector('#h-best')&&document.querySelector('#h-best').textContent};});console.log(JSON.stringify(r));}
console.log('errs',errs);await br.close();})();
