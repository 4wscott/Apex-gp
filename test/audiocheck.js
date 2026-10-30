// measures the game's real audio output level during a race (analyser on the master bus)
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await br.newPage({viewport:{width:1280,height:720}});
const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.text().slice(0,200));});
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:2,opponents:3,laps:3}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.mouse.click(5,5);await page.click('#start',{noWaitAfter:true}).catch(()=>{});await page.waitForTimeout(6000);
await page.evaluate(()=>{const a=App.audio;const an=a.ctx.createAnalyser();an.fftSize=2048;a.master.connect(an);window.__an=an;App.session.race.lightsT=99;});
const level=()=>page.evaluate(()=>{const d=new Float32Array(2048);window.__an.getFloatTimeDomainData(d);let s=0;for(const v of d)s+=v*v;const a=App.audio;return {rms:+Math.sqrt(s/d.length).toFixed(4),state:a.ctx.state,loops:!!a.loops,master:a.master.gain.value,eng:+a.player.g.gain.value.toFixed(3),music:App.music.bus?+App.music.bus.gain.value.toFixed(3):null};});
console.log('idle',await level());
await page.keyboard.down('a');await page.waitForTimeout(3000);console.log('throttle',await level());await page.keyboard.up('a');
console.log('errs',errs.slice(0,6));await br.close();})();
