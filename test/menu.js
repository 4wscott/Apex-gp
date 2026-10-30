const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for (const [name,vp,touch] of [['pc',{width:1280,height:720},false],['phone',{width:844,height:390},true]]) {
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:5,mode:location.hash.slice(1)||'race'}))});
await page.goto('http://local/#'+(process.argv[2]||'race'));await page.waitForTimeout(6000);
await page.screenshot({path:SP+`menu-${name}.png`,timeout:120000});
await page.evaluate(()=>{document.querySelector('.modes [data-v="practice"]').click();for(let i=0;i<6;i++)document.querySelector('#pick-team .arr[data-d="1"]').click();});await page.waitForTimeout(2500);await page.waitForTimeout(800);await page.screenshot({path:SP+`menu-${name}-setup.png`,timeout:120000});await page.evaluate(()=>{document.querySelector('#m-gear').click();});await page.waitForTimeout(800);await page.screenshot({path:SP+`menu-${name}-settings.png`,timeout:120000});
console.log(name,'scroll height',await page.evaluate(()=>document.querySelector('#menu').scrollHeight),errs);await ctx.close();}
await br.close();})();
