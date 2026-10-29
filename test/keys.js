// Drives with the keyboard on a given URL and reports speed/steer, to check PC controls end to end.
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const url=process.argv[2]||'local';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await br.newPage({viewport:{width:1280,height:720}});
const errs=[];page.on('pageerror',e=>errs.push(e.message));
if(url==='local'){const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));await page.goto('http://local/');}
else await page.goto(url);
await page.addStyleTag({content:'*{}'});await page.waitForTimeout(8000);
await page.evaluate(()=>{localStorage.setItem('apexgp.settings',JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('apexgp.settings')||'{}'),{quality:0})));});
// start like a user: click the Start button
await page.click('#start');await page.waitForTimeout(3000);
const st=()=>page.evaluate(()=>{const P=App.session&&App.session.race.player;return P?{phase:App.session.race.phase,kmh:Math.round(P.vx*3.6),steer:+P.delta.toFixed(3),thr:+P.throttle.toFixed(2),brk:+P.brake.toFixed(2),device:App.input.lastDevice}:null;});
await page.evaluate(()=>{App.session.race.lightsT=99;});
// wait for lights out
for(let i=0;i<40;i++){const s=await st();if(s&&s.phase==='green')break;await page.waitForTimeout(500);}
console.log('before',await st());
const hold=async(keys,ms)=>{for(const k of keys)await page.keyboard.down(k);await page.waitForTimeout(ms);const s=await st();for(const k of keys)await page.keyboard.up(k);return s;};
for(const [label,keys] of [['A (throttle?)',['a']],['W',['w']],['ArrowUp',['ArrowUp']],['ArrowLeft',['ArrowLeft']],['D (brake?)',['d']]]) console.log(label.padEnd(14),JSON.stringify(await hold(keys,1500)));
console.log('errs',errs.slice(0,5));await br.close();})();
