// Drives with the keyboard on a given URL and reports speed/steer, to check PC controls end to end.
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const url=process.argv[2]||'local';
const { open } = require('./visualbase.js');
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
// the shared page setup (local build, three.js from the scratchpad, saved settings for this version)
const page=await open(br,{quality:0,mode:'race',track:'parco',opponents:3,laps:2},{viewport:{width:1280,height:720}});const errs=page.errs;
// start like a user: click the Start button
await page.evaluate(()=>setTimeout(()=>document.querySelector('#start').click(),0));await page.waitForFunction(()=>window.App&&App.session&&App.session.race,null,{timeout:240000});await page.waitForTimeout(1000);
const st=()=>page.evaluate(()=>{const P=App.session&&App.session.race.player;return P?{phase:App.session.race.phase,kmh:Math.round(P.vx*3.6),steer:+P.delta.toFixed(3),thr:+P.throttle.toFixed(2),brk:+P.brake.toFixed(2),device:App.input.lastDevice}:null;});
await page.evaluate(()=>{App.session.race.lightsT=99;});
// wait for lights out
for(let i=0;i<40;i++){const s=await st();if(s&&s.phase==='green')break;await page.waitForTimeout(500);}
console.log('before',await st());
const hold=async(keys,ms)=>{for(const k of keys)await page.keyboard.down(k);await page.waitForTimeout(ms);const s=await st();for(const k of keys)await page.keyboard.up(k);return s;};
for(const [label,keys] of [['A (throttle?)',['a']],['W',['w']],['ArrowUp',['ArrowUp']],['ArrowLeft',['ArrowLeft']],['D (brake?)',['d']]]) console.log(label.padEnd(14),JSON.stringify(await hold(keys,1500)));
console.log('errs',errs.slice(0,5));await br.close();})();
