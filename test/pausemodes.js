// Every mode: pause, open Settings, change camera + traction control live, back to the pause card, resume, then quit to the menu.
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
for(const mode of ['race','practice','trial','career']){
const ctx=await br.newContext({viewport:{width:1280,height:720}});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((m)=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:3,mode:m,track:'silver',opponents:3,camera:'cockpit',tc:2}))},mode);
await page.goto('http://local/');await page.waitForTimeout(6000);
if(mode==='career'){await page.evaluate(()=>{const b=[...document.querySelectorAll('#career button')].find(b=>/start|create|begin/i.test(b.textContent));b&&b.click();});await page.waitForTimeout(800);await page.evaluate(()=>{const b=[...document.querySelectorAll('#career button')].find(b=>/race|weekend|start|go/i.test(b.textContent)&&!b.hidden);b&&b.click();});}
else await page.evaluate(()=>document.querySelector('#start').click());
await page.waitForTimeout(4000);
const st=()=>page.evaluate(()=>({mode:App.session&&App.session.race.mode,paused:App.paused,pauseCard:!document.querySelector('#pause').hidden,settingsOpen:document.body.classList.contains('race-settings')&&!document.querySelector('#menu').hidden,cam:App.session&&App.session.camMode,tc:App.session&&App.session.race.player.assist.tc,restartBtn:!document.querySelector('#p-restart').hidden,menu:!document.querySelector('#menu').hidden,session:!!App.session}));
if(!(await st()).session){console.log(mode,'did not start');await ctx.close();continue;}
await page.keyboard.press('Escape');await page.waitForTimeout(400);const a=await st();
await page.click('#p-settings');await page.waitForTimeout(400);const b=await st();
await page.evaluate(()=>{document.querySelector('.tab[data-panel="p-assist"]').click();document.querySelector('[data-set="tc"] [data-v="0"]').click();document.querySelector('[data-set="camera"] [data-v="chase"]').click();});
await page.click('#drawer-close');await page.waitForTimeout(300);const c=await st();
await page.click('#p-resume');await page.waitForTimeout(5000);console.log('  settings.tc',await page.evaluate(()=>JSON.parse(localStorage.getItem('apexgp.settings')).tc));const d=await st();
await page.keyboard.press('Escape');await page.waitForTimeout(400);await page.click('#p-quit');await page.waitForTimeout(1500);const e=await st();
console.log(mode.padEnd(9),'paused',a.paused&&a.pauseCard,'| settings open',b.settingsOpen,'| back to pause card',c.pauseCard&&!c.settingsOpen,'| resumed',!d.paused,'cam',d.cam,'tc',d.tc,'| quit → menu',!e.session&&e.menu,errs.length?errs:'');
await ctx.close();}
await br.close();})();
