const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await br.newPage({viewport:{width:960,height:540}});
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{try{localStorage.setItem('apexgp.settings','{"quality":1,"mirrors":false,"v":5,"camera":"chase"}')}catch(e){}});
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>{document.querySelector('#menu').hidden=true;});
// fly the camera to the first corner grandstand
const shots=await page.evaluate(()=>{const T=App.previewTrack,n=T.n,out=[];
  T.brakeZones.forEach((apex,k)=>{if(k%2)return;const side=T.kapW[apex]>0?-1:1,off=(side>0?T.wallL:T.wallR)[apex]+10;out.push({x:T.px[apex]+T.nx[apex]*off*side*0.2,y:T.py[apex]+T.ny[apex]*off*side*0.2,tx:T.px[apex]+T.nx[apex]*off*side,ty:T.py[apex]+T.ny[apex]*off*side});});return out.slice(0,2);});
for(const [k,sh] of shots.entries()){await page.evaluate((sh)=>{const c=App.previewCar.grp.position;window.DEBUG_CAM=[sh.x-c.x,6,-sh.y-c.z,sh.tx-c.x,5,-sh.ty-c.z];},sh);await page.waitForTimeout(3000);await page.screenshot({path:SP+'stand'+k+'.png',timeout:120000});}
console.log('errs',errs);await br.close();})();
