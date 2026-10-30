const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});const page=await br.newPage({viewport:{width:1280,height:720}});
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('https://apexgp.test/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:3,musicSource:'youtube'}))});
await page.goto('https://apexgp.test/');await page.waitForTimeout(6000);

await page.mouse.click(600,300);for(let i=0;i<30;i++){if(await page.evaluate(()=>YTMusic.ready&&YTMusic.player.getPlayerState()===1))break;await page.waitForTimeout(2000);}
const st=()=>page.evaluate(()=>({src:JSON.stringify(YTMusic.src),pick:YTMusic.pick(),ready:YTMusic.ready,failed:YTMusic.failed,msg:YTMusic.msg,state:YTMusic.ready?YTMusic.player.getPlayerState():null,title:YTMusic.title(),vol:YTMusic.ready?YTMusic.player.getVolume():null,dock:!document.querySelector('#yt-dock').hidden}));
console.log('menu',await st());
await page.screenshot({path:SP+'yt-menu.png',timeout:120000});
await page.evaluate(()=>App.start());await page.waitForTimeout(8000);
console.log('race',await st());await page.screenshot({path:SP+'yt-race.png',timeout:120000});
console.log('errs',errs.slice(0,4));await br.close();})();
