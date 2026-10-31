// v3 Phase 4: mocked Xbox / PlayStation pads: names, button labels, per-pad saved setups, vibration strength, menu navigation
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await br.newPage({viewport:{width:1280,height:720}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:7,mode:'practice',track:'silver',camera:'chase'}));
  // fake gamepads: tests set window.__pad
  const mk=(id)=>({id,index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0})),vibrationActuator:{playEffect:(t,o)=>{(window.__rumbles=window.__rumbles||[]).push(o);return Promise.resolve();}}});
  window.__mk=mk;window.__pad=null;navigator.getGamepads=()=>[window.__pad];});
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
const out=await ev(async()=>{const o={};const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  const press=async(i,ms=120)=>{window.__pad.buttons[i]={pressed:true,value:1};await wait(ms);window.__pad.buttons[i]={pressed:false,value:0};await wait(120);};
  window.__pad=window.__mk('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)');window.dispatchEvent(Object.assign(new Event('gamepadconnected'),{gamepad:window.__pad}));await wait(300);
  o.kind=Pads.kind(window.__pad);o.toast=document.querySelector('#pad-toast').textContent;
  o.labels=['throttle','brake','shiftUp','camera','pit'].map(a=>Pads.label(App.input.binds.map[a],'xbox')).join(',');
  o.psLabels=['throttle','brake','shiftUp','camera'].map(a=>Pads.label(App.input.binds.map[a],'ps')).join(',');
  // menu nav: RB changes mode, D-pad down + A presses something
  const m0=SIM.settings.mode;await press(5);o.modeAfterRB=m0+'->'+SIM.settings.mode;await press(4);
  await press(13);o.focused=document.activeElement&&(document.activeElement.id||document.activeElement.textContent.trim().slice(0,20));
  // open settings with A on the settings button
  document.querySelector('#m-gear').focus();await press(0);o.drawer=document.querySelector('#menu').dataset.drawer;await press(1);o.drawerAfterB=document.querySelector('#menu').dataset.drawer||'closed';
  // per-pad setup: rebind throttle on the Xbox pad, switch to a PS pad (defaults), back to Xbox (restored)
  App.input.poll(0.016,0,SIM.settings);App.input.binds.map.throttle={type:'button',index:0};App.input.saveBinds();
  window.__pad=window.__mk('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)');App.input.poll(0.016,0,SIM.settings);o.psThrottle=JSON.stringify(App.input.binds.map.throttle);
  window.__pad=window.__mk('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)');App.input.poll(0.016,0,SIM.settings);o.xboxThrottleBack=JSON.stringify(App.input.binds.map.throttle);
  App.input.resetBinds();
  // vibration strength
  window.__rumbles=[];SIM.settings.rumbleLevel='light';Hud.lastRumble=0;Hud.rumble(1,1,100);SIM.settings.rumbleLevel='off';Hud.lastRumble=0;Hud.rumble(1,1,100);o.rumbles=JSON.stringify(window.__rumbles);SIM.settings.rumbleLevel='strong';
  return o;});
console.log(JSON.stringify(out,null,1));
// in a session: pause card summary
await ev(()=>{window.__pad=window.__mk('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)');document.querySelector('#start').click();});await page.waitForTimeout(7000);
await ev(()=>App.togglePause(true));await page.waitForTimeout(400);
console.log('pause card:',await ev(()=>document.querySelector('#p-pad').textContent));
await page.screenshot({path:SP0+'v3p4-pause.png'});
await ev(()=>{App.togglePause(false);Menu.drawer&&0;});
console.log('errs',errs);await br.close();})();
