// does the minimap dot follow the car? practice and race, a few points round the lap
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await br.newPage({viewport:{width:1280,height:720}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:4,mode:'practice',track:'silver',camera:'chase'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
// change circuit in the menu first, like a player, then start
await page.evaluate(()=>{document.querySelector('#pick-circuit .arr[data-d="1"]').click();});await page.waitForTimeout(3000);
await page.evaluate(()=>document.querySelector('#start').click());await page.waitForTimeout(6000);
for(let k=0;k<4;k++){
  const r=await page.evaluate(()=>{const S=App.session,r=S.race,P=r.player;const ai=new SIM.AIDriver(P,0.95,5);for(let n=0;n<360*12;n++)r.step(1/360,ai.control(1/360,r.cars,r));
    const [x,y]=App.Hud?App.Hud.mapTf(P.x,P.y):[0,0];return {track:r.track.spec.id,dist:Math.round(P.dist),x:P.x.toFixed(0),y:P.y.toFixed(0)};});
  await page.waitForTimeout(1500);
  const clip=await page.$eval('#minimap',e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};});
  await page.screenshot({path:SP0+'mm'+k+'.png',clip,timeout:120000});console.log(k,JSON.stringify(r));
}
console.log('errs',errs);await br.close();})();
