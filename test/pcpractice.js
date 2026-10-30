// PC practice, like a player: click Practice, click Start, then camera (C), pause (Esc), settings, resume, quit;
// also with keyboard focus stolen by an iframe (the YouTube player) and the on-screen pause button
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await br.newPage({viewport:{width:1280,height:720}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:5,mode:'race',camera:'cockpit'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.mouse.click(...await page.$eval('.modes [data-v="practice"]',e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];}));await page.waitForTimeout(500);
// drag the traffic slider like a user, leaving focus on it
await page.evaluate(()=>{document.querySelector('#open-opts').click();});await page.waitForTimeout(300);await page.focus('#traffic');await page.keyboard.press('ArrowRight');await page.evaluate(()=>document.querySelector('#drawer-close').click());
await page.mouse.click(...await page.$eval('#start',e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];}));await page.waitForTimeout(5000);
const st=()=>page.evaluate(()=>({mode:App.session&&App.session.race.mode,cam:App.session&&App.session.camMode,paused:App.paused,focus:document.activeElement&&(document.activeElement.id||document.activeElement.tagName)}));
console.log('started',JSON.stringify(await st()));
const key=async(k)=>{await page.keyboard.down(k);await page.waitForTimeout(200);await page.keyboard.up(k);await page.waitForTimeout(1500);};
await key('c');console.log('after C',JSON.stringify(await st()));
const clk=async(sel)=>{await page.mouse.click(...await page.$eval(sel,e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];}));await page.waitForTimeout(1500);};
await page.screenshot({path:SP0+'pcprac-btns.png',timeout:120000});
await clk('#pc-btns [data-act="camera"]');console.log('after Camera button',JSON.stringify(await st()));
await clk('#pc-btns [data-act="settings"]');console.log('after Settings button',JSON.stringify(await st()),await page.evaluate(()=>document.body.classList.contains('race-settings')));
await clk('#drawer-close');await clk('#p-resume');console.log('resumed',JSON.stringify(await st()));
// steal focus into an iframe, as the YouTube player can
await page.evaluate(()=>{const f=document.createElement('iframe');f.id='thief';f.srcdoc='<input id=i>';document.body.appendChild(f);});await page.waitForTimeout(500);
await page.frameLocator('#thief').locator('#i').focus();await page.waitForTimeout(2500);
console.log('after iframe stole focus',JSON.stringify(await st()));
await key('c');console.log('after C',JSON.stringify(await st()));
await key('Escape');console.log('after Esc',JSON.stringify(await st()));
await page.mouse.click(...await page.$eval('#p-resume',e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];}));await page.waitForTimeout(1500);
await page.mouse.click(...await page.$eval('#pc-btns [data-act="pause"]',e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];}));await page.waitForTimeout(1500);
console.log('after pause button',JSON.stringify(await st()));
await page.screenshot({path:SP0+'pcprac-pause.png',timeout:120000});
await page.mouse.click(...await page.$eval('#p-quit',e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];}));await page.waitForTimeout(2000);
console.log('after quit',JSON.stringify(await st()),'errs',errs);await br.close();})();
