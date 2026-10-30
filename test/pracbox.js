// Practice: pick tyres with PIT, pause, "Return to pit box": car rolls into its box, crew changes tyres, drives out
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await br.newPage({viewport:{width:1280,height:720}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:5,mode:'practice',track:'parco',camera:'chase',compound:'S'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>document.querySelector('#start').click());await page.waitForTimeout(6000);
const clk=async(sel)=>{await page.mouse.click(...await page.$eval(sel,e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];}));await page.waitForTimeout(1200);};
await clk('#pc-btns [data-act="pit"]');
const st=()=>page.evaluate(()=>{const P=App.session.race.player;return {req:P.pitReq,cmp:P.compound,phase:P.pit?P.pit.phase:'track',paused:App.paused,banner:document.querySelector('#banner')&&document.querySelector('#banner').textContent};});
console.log('picked',JSON.stringify(await st()));
await clk('#pc-btns [data-act="pause"]');
console.log('garage button visible',await page.evaluate(()=>!document.querySelector('#p-garage').hidden));
await clk('#p-garage');console.log('after return',JSON.stringify(await st()));
for(let k=0;k<12;k++){await page.waitForTimeout(1500);const s=await st();console.log(k,JSON.stringify(s));if(k===2||k===5)await page.screenshot({path:SP0+'box'+k+'.png',timeout:120000});if(s.phase==='track'&&k>3)break;}
console.log('errs',errs);await br.close();})();
