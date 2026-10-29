// Renders a walkthrough video frame by frame on a virtual clock, so playback is smooth
// even though software WebGL here is slow. Usage: node test/video.js <segment> <outdir>
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const seg=process.argv[2]||'main', OUT=process.argv[3]||SP+'frames_'+seg, FPS=24, LIMIT=+process.env.LIMIT||1e9;
fs.mkdirSync(OUT,{recursive:true});
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{
 const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const phone=seg==='phone';
 const page=await br.newPage(phone?{viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1.5}:{viewport:{width:1280,height:720}});
 const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
 const settings=phone?{quality:0,mirrors:false,v:2,camera:'chase',mode:'race',track:'parco',team:'taurus',driver:'VLE',opponents:11}
   :{quality:1,mirrors:true,v:2,camera:'chase',mode:'race',track:'parco',team:'taurus',driver:'VLE',opponents:21,laps:5};
 await page.addInitScript((st)=>{try{localStorage.clear();localStorage.setItem('apexgp.settings',JSON.stringify(st))}catch(e){}
   window.__vt=0;performance.now=()=>window.__vt;window.__rafs=[];window.requestAnimationFrame=(cb)=>{window.__rafs.push(cb);return 1;};},settings);
 await page.goto('http://local/');await page.waitForTimeout(4000);
 // caption overlay
 await page.evaluate(()=>{const c=document.createElement('div');c.id='cap';c.style.cssText='position:fixed;right:3%;top:42%;z-index:99;max-width:40vw;text-align:left;pointer-events:none;font-family:"Saira Condensed","Arial Narrow",sans-serif;background:rgba(8,10,14,.86);border-left:5px solid #ffd21f;border-radius:6px;padding:12px 20px';
   c.innerHTML='<div id="cap-t" style="color:#fff;font-weight:800;font-size:clamp(18px,2.5vw,32px);letter-spacing:.03em;text-transform:uppercase"></div><div id="cap-s" style="margin-top:4px;color:#d7dce4;font-family:Arial,sans-serif;font-size:clamp(12px,1.3vw,17px);line-height:1.35"></div>';document.body.appendChild(c);});
 const cap=(t,s='')=>page.evaluate(([t,s])=>{document.querySelector('#cap').hidden=!t;document.querySelector('#cap-s').hidden=!s;document.querySelector('#cap-t').textContent=t;document.querySelector('#cap-s').textContent=s;},[t,s]);
 // player car driven by an AI so the footage is clean
 await page.evaluate(()=>{const orig=App.input.poll.bind(App.input);App.input.poll=(dt,v,s)=>{const b=orig(dt,v,s);if(window.__ai&&App.session){const r=App.session.race;Object.assign(b,window.__ai.control(dt,r.cars,r));}return b;};});
 let n=0;
 const frames=async(sec,each)=>{const k=Math.round(sec*FPS);for(let i=0;i<k&&n<LIMIT;i++){if(each)await each(i,k);
   await page.evaluate((dt)=>{window.__vt+=dt;const c=window.__rafs;window.__rafs=[];c.forEach(f=>f(window.__vt));},1000/FPS);
   await page.screenshot({path:path.join(OUT,String(n++).padStart(5,'0')+'.jpg'),type:'jpeg',quality:88,timeout:600000});
   if(n%24===0)console.log('frame',n);}};
 const ev=(f,a)=>page.evaluate(f,a);
 const startRace=async(cam)=>{await ev(()=>{App.start();});for(let i=0;i<60&&!(await ev(()=>!!(App.session&&App.session.race)));i++)await page.waitForTimeout(500);
   await ev((cam)=>{const r=App.session.race;App.session.camMode=cam;window.__ai=new SIM.AIDriver(r.player,1.0,5);r.lightsOutAt=6.4;},cam);};
 if(!phone){
  await cap('Apex Grand Prix','A 3D open-wheel racer for phone and PC · 11 teams · 8 circuits · 2026-style cars');
  await frames(3.5);
  await cap('Pick your circuit','Eight fictional circuits inspired by the real calendar');
  await frames(3,async(i,k)=>{await ev((f)=>{document.querySelector('#menu').scrollTop=f*360;},i/k);});
  await cap('Pick your team and driver','Team colours follow the 2026 grid');
  await ev(()=>{document.querySelector('#teams').scrollIntoView({block:'start'});document.querySelector('#menu').scrollTop-=80;});
  await frames(1.2);
  await ev(()=>document.querySelector('.drv[data-team="rossa"][data-code="NAV"]').click());await frames(1.4);
  await ev(()=>document.querySelector('.drv[data-team="taurus"][data-code="VLE"]').click());await frames(1.4);
  await cap('Rename any team or driver','Your own names, codes and numbers show everywhere in the game');
  await ev(()=>{const r=document.querySelector('#roster');r.open=true;r.scrollIntoView({block:'start'});});await frames(3);
  await ev(()=>{document.querySelector('#roster').open=false;});
  await cap('Driving assists and tyres','Traction control, ABS, gearbox, racing line, soft / medium / hard compounds');
  await ev(()=>{document.querySelectorAll('.tab')[1].click();document.querySelector('#menu').scrollTop=0;});await frames(3);
  await cap('Controls for every device','Keyboard, gamepad, steering wheel with binding, and phone touch controls');
  await ev(()=>{document.querySelectorAll('.tab')[2].click();});await frames(3);
  await cap('Career mode','8-round season · qualifying · points · car development · saved to your account');
  await ev(()=>{document.querySelectorAll('.tab')[0].click();SIM.settings.mode='career';if(!Career.data)Career.newCareer({name:'Alex Rookie',num:27,team:'grove',replaces:'SIN',laps:5});Career.data.points={VLE:43,PRI:36,NAV:30,ROO:22};Career.data.round=2;Career.render();Menu.sync();document.querySelector('#menu').scrollTop=200;});
  await frames(4,async(i,k)=>{await ev((f)=>{document.querySelector('#menu').scrollTop=200+f*700;},i/k);});
  await ev(()=>{SIM.settings.mode='race';Menu.sync();});
  await cap('Race day','22 cars on the grid');
  await startRace('chase');
  await frames(2.2);
  await cap('Five red lights...','');
  await frames(4.2);
  await cap('Lights out!','');
  await frames(4);
  await cap('T-cam','');await ev(()=>{App.session.camMode='tcam';});await frames(3.5);
  await cap('Cockpit view','Working steering wheel: shift lights, live screen, ERS and brake-bias knobs');
  await ev(()=>{App.session.camMode='cockpit';});await frames(8);
  await cap('Active aero and hybrid power','Wing flaps open on the straights · 350 kW electric boost');
  await ev(()=>{App.session.camMode='chase';});await frames(5);
  await cap('Far chase','');await ev(()=>{App.session.camMode='far';});await frames(4);
  await cap('Apex Grand Prix','Career and free play · phone and PC');await ev(()=>{App.session.camMode='chase';});await frames(2.5);
 } else {
  await cap('On your phone','Arrows to steer · brake and throttle pedals · camera, ERS, overtake and more');
  await startRace('chase');await frames(9);
  await cap('Cockpit on your phone','');await ev(()=>{App.session.camMode='cockpit';});await frames(4);
 }
 console.log('done',n,'frames errors:',errs.join(' | ')||'none');
 await br.close();
})();
