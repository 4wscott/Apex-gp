const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await br.newPage({viewport:{width:640,height:360}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:6,mode:'practice',track:'parco',camera:'chase'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
console.log(await page.evaluate(()=>{const S=App.session,r=S.race,P=r.player,keys=App.input.keys;let t=performance.now();const out=[];App.render=()=>{};
  r.toBox(P,'S');for(let n=0;n<30;n++){t+=16.7;App.frame(t);} out.push('in pit: '+(P.pit&&P.pit.phase));
  keys.add('KeyR');t+=16.7;App.frame(t);keys.delete('KeyR');for(let n=0;n<5;n++){t+=16.7;App.frame(t);}
  out.push('after reset: pit='+(P.pit&&P.pit.phase)+' d='+P.d.toFixed(1)+' visible='+P.mesh.grp.visible);
  keys.add('KeyA');for(let n=0;n<60;n++){t+=16.7;App.frame(t);}keys.clear();out.push('drives after: '+Math.round(P.vx*3.6)+' km/h');
  P.x=NaN;P.vx=NaN;t+=16.7;App.frame(t);for(let n=0;n<3;n++){t+=16.7;App.frame(t);} out.push('after NaN: x='+P.x.toFixed(1)+' ok='+Number.isFinite(P.x)+' flash='+document.querySelector('#flash').textContent);
  return out.join(' | ');}));
console.log('errs',errs);await br.close();})();
