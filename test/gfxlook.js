const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for (const [q,vp,cam] of [[0,{width:844,height:390},'chase'],[0,{width:844,height:390},'cockpit'],[1,{width:960,height:540},'chase'],[1,{width:960,height:540},'cockpit']]) {
const page=await br.newPage({viewport:vp});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(([q,cam])=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:q,v:5,opponents:7,camera:cam,track:'riviera'}))},[q,cam]);
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>{App.start();});await page.waitForTimeout(6000);
await page.evaluate(()=>{App.session.race.lightsT=99;const P=App.session.race.player;});
await page.keyboard.down('a');await page.waitForTimeout(9000);
await page.screenshot({path:SP+`g-q${q}-${cam}.png`,timeout:120000});await page.keyboard.up('a');
if(errs.length)console.log(errs);await page.close();}
await br.close();
require('child_process').execSync(`python3 -c "
from PIL import Image
ims=[Image.open('${SP}g-q%d-%s.png'%(q,c)).resize((960,540)) for q in (0,1) for c in ('chase','cockpit')]
o=Image.new('RGB',(1920,1080));[o.paste(im,((i%2)*960,(i//2)*540)) for i,im in enumerate(ims)];o.save('${SP}g-grid.png')"`);})();
