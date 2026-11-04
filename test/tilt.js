// tilt steering on a phone-sized screen: permission flow (iOS style), steering direction and size from simulated gravity, centring, invert, settings meter
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [label,perm] of [['iPhone, allowed','granted'],['iPhone, denied','denied']]){
const ctx=await br.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((perm)=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:7,mode:'practice',track:'silver',camera:'chase'}));
  // iOS-style permission prompt, and a landscape screen (angle 90)
  window.DeviceMotionEvent=window.DeviceMotionEvent||function(){};DeviceMotionEvent.requestPermission=()=>{window.__asked=(window.__asked||0)+1;return Promise.resolve(perm);};
  try{Object.defineProperty(screen,'orientation',{value:{angle:90,type:'landscape-primary',addEventListener(){} },configurable:true});}catch(e){}
  // gravity for a phone held sideways like a wheel, turned by `deg` (clockwise = to the right); iOS reports it with flipped signs
  window.__tilt=(deg)=>{const t=deg*Math.PI/180,g=9.81;const sx=-g*Math.sin(t),sy=g*Math.cos(t);/* screen -> device for angle 90: x=-sy, y=sx */const x=-sy,y=sx;
    const e=new Event('devicemotion');e.accelerationIncludingGravity={x:-x,y:-y,z:-3};window.dispatchEvent(e);};},perm);
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{Menu.drawer('settings');document.querySelector('.tab[data-panel="p-controls"]').click();});await page.waitForTimeout(400);
await ev(()=>document.querySelector('[data-set="touchSteer"] [data-v="tilt"]').click());await page.waitForTimeout(600);
console.log(label,'| setting:',await ev(()=>SIM.settings.touchSteer),'| asked:',await ev(()=>window.__asked),'| message:',await ev(()=>document.querySelector('#tilt-msg').textContent.slice(0,70)));
if(perm==='granted'){
  await page.screenshot({path:SP0+'tilt-settings.png',timeout:120000});
  await ev(()=>{Menu.drawer(null);document.querySelector('#start').click();});await page.waitForTimeout(7000);
  const r=await ev(async()=>{const out={};const w=(ms)=>new Promise(r=>setTimeout(r,ms));
    // held slightly tilted at the start (8 degrees right): that becomes straight ahead
    for(let k=0;k<10;k++){window.__tilt(8);await w(20);}Tilt.centre();
    const read=async(deg)=>{for(let k=0;k<12;k++){window.__tilt(deg);await w(20);}App.input.poll(0.016,30,SIM.settings);return +App.input.touch.steer.toFixed(2);};
    out.straight=await read(8);out.right20=await read(28);out.left20=await read(-12);out.fullRight=await read(60);out.tinyShake=await read(9);
    SIM.settings.tiltInvert=true;out.reversedRight20=await read(28);SIM.settings.tiltInvert=false;
    SIM.settings.touchSens=2;out.right20at2x=await read(28);SIM.settings.touchSens=1;
    out.centreBtn=!!document.querySelector('#t-centre');out.device=App.input.lastDevice;return out;});
  console.log('  steering (+ = left, - = right):',JSON.stringify(r));
  await ev(()=>{for(let k=0;k<12;k++)window.__tilt(30);});await page.waitForTimeout(1500);await page.screenshot({path:SP0+'tilt-race.png',timeout:120000});
}
console.log('  errs',errs);await ctx.close();}
await br.close();})();
