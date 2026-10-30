// Practice: click PIT, drive on, does the car go into the pit lane and get its stop?
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await br.newPage({viewport:{width:1280,height:720}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((t)=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:3,mode:'practice',track:t,camera:'chase',traffic:3}))},process.argv[2]||'silver');
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>document.querySelector('#start').click());await page.waitForTimeout(6000);
const clk=async(sel)=>{await page.mouse.click(...await page.$eval(sel,e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];}));await page.waitForTimeout(1200);};
await clk('#pc-btns [data-act="pit"]');
console.log('after PIT click',JSON.stringify(await page.evaluate(()=>{const r=App.session.race,P=r.player;return {req:P.pitReq,phase:r.phase,banner:document.querySelector('#banner')&&document.querySelector('#banner').textContent,s:Math.round(P.s),pitA:r.pit.a*r.track.ds,len:Math.round(r.track.length)};})));
const log=await page.evaluate(()=>{const r=App.session.race,P=r.player;const ai=new SIM.AIDriver(P,0.95,5);const out=[];let last='';
  for(let n=0;n<360*200;n++){r.step(1/360,ai.control(1/360,r.cars,r));const ph=P.pit?P.pit.phase:'track';if(ph!==last){out.push(ph+'@'+r.time.toFixed(1)+' s='+Math.round(P.s));last=ph;} if(out.length>5)break;}
  App.handleEvents(r);return out.join(' | ')+' req='+P.pitReq+' compound='+P.compound;});
console.log(log,'errs',errs);await br.close();})();
