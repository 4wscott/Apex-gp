const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
const tag=process.argv[2]||'a';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await br.newPage({viewport:{width:800,height:450}});
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{try{localStorage.setItem('apexgp.settings','{"quality":1,"mirrors":false,"v":2,"team":"taurus"}')}catch(e){}});
await page.goto('http://local/');await page.waitForTimeout(5000);
const views={hA:[0.9,1.35,0.0,0.3,0.68,0],hB:[0.6,1.05,-0.5,0.36,0.7,-0.1],hC:[1.4,1.6,-0.9,0.2,0.7,0],rear:[-4.2,1.2,0.01,0,0.5,0]};
await page.evaluate(()=>{window.BASIC=true;window.THREE_BASIC=App.previewCar.blurs[0].material.constructor;document.querySelector('#menu').hidden=true;const m=App.previewCar;if(window.BASIC){const mb=m.modelBody;mb.material=new THREE_BASIC({map:mb.material.map});}});
for(const [k,v] of Object.entries(views)){await page.evaluate((v)=>{window.DEBUG_CAM=v;},v);await page.waitForTimeout(2500);await page.screenshot({path:SP+'car-'+tag+'-'+k+'.png',timeout:120000});}
console.log('errs',errs);await br.close();
const {execSync}=require('child_process');execSync(`python3 -c "
from PIL import Image
ks=['hA','hB','hC','rear']
ims=[Image.open('${SP}car-${tag}-'+k+'.png') for k in ks]
o=Image.new('RGB',(1600,900));[o.paste(im,((i%2)*800,(i//2)*450)) for i,im in enumerate(ims)];o.save('${SP}car-${tag}.png')"`);})();
