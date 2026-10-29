const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const three=fs.readFileSync(SP+'package/build/three.min.js','utf8');
const page_html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
const steps=JSON.parse(process.argv[2]||'[]');
(async()=>{
 const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const mob=process.env.MOBILE;const page=await br.newPage(mob?{viewport:{width:+mob.split('x')[0],height:+mob.split('x')[1]},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{viewport:{width:1280,height:720}});
 const errs=[];page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text())});page.on('pageerror',e=>errs.push('PAGEERROR '+e.message+'\n'+e.stack));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());const f=SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/','');r.fulfill({body:fs.readFileSync(f,'utf8'),contentType:'application/javascript'});});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('http://local/',r=>r.fulfill({body:page_html,contentType:'text/html'}));
 const pre=process.env.PRE||'{"quality":1,"mirrors":false}';await page.addInitScript(p=>{try{localStorage.setItem('apexgp.settings',p)}catch(e){}},pre);
 await page.goto('http://local/');
 await page.waitForTimeout(1500);
 for(const s of steps){
   if(s.shot){await page.screenshot({path:SP+s.shot,timeout:120000});console.log('shot',s.shot);}
   if(s.click){await page.click(s.click);}
   if(s.eval){try{console.log('eval',JSON.stringify(await page.evaluate(s.eval)));}catch(e){console.log('eval err',e.message.split('\n')[0]);}}
   if(s.wait){await page.waitForTimeout(s.wait);}
   if(s.down){await page.keyboard.down(s.down);}
   if(s.up){await page.keyboard.up(s.up);}
   if(s.press){await page.keyboard.press(s.press);}
 }
 console.log(errs.slice(0,15).join('\n'));
 await br.close();
})();
