// v3 Phase 2: sound. Unit checks for Doppler + ducking maths, and a scripted pass-by through the real audio graph.
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
// maths: Doppler factor for +/-40 m/s closing
const dop=(v)=>343/(343-v);console.log('doppler +40 m/s',dop(40).toFixed(3),'-40 m/s',dop(-40).toFixed(3),'(about one semitone up / down)');
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
for(const [name,vp,touch] of [['pc',{width:640,height:360},false],['iphone',{width:844,height:390},true]]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:7,mode:'race',track:'silver',camera:'chase',opponents:3,laps:2,radio:'voice',musicSource:'game'}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.mouse.click(5,200);await page.evaluate(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
const r=await page.evaluate(async()=>{const A=App.audio,out={ctx:A.ctx&&A.ctx.state,fx:!!A.fx,shelves:!!(A.player&&A.player.low)};
  // camera tone
  App.session.camMode='cockpit';App.frame(performance.now()+20);await new Promise(r=>setTimeout(r,600));out.cockpitLow=+A.player.low.gain.value.toFixed(1);out.cockpitHigh=+A.player.high.gain.value.toFixed(1);
  App.session.camMode='chase';App.frame(performance.now()+40);await new Promise(r=>setTimeout(r,600));out.chaseHigh=+A.player.high.gain.value.toFixed(1);
  // pass-by: place a rival just ahead, fast, closing
  const r=App.session.race,P=r.player,o=r.cars.find(c=>c!==P);r.lightsT=99;
  let n=0;const orig=A.whoosh.bind(A);A.whoosh=(k,p)=>{n++;orig(k,p);};
  P.vx=70;o.vx=40;o.x=P.x+Math.cos(P.h)*12;o.y=P.y+Math.sin(P.h)*12;o.h=P.h;
  for(let k=0;k<12;k++){App.frame(performance.now()+60*(k+3));}out.whooshes=n;
  out.otherPitchHz=+A.other.oscs[1].o.frequency.value.toFixed(0);
  // radio duck
  Radio.say('Test radio message',2);App.frame(performance.now()+1000);await new Promise(r=>setTimeout(r,500));out.fxDucked=+A.fx.gain.value.toFixed(2);out.musicRadio=App.music.radioDuck;
  // effects volume
  A.setFx(0.4);await new Promise(r=>setTimeout(r,300));out.fxVol=A.fxVol;
  A.cheer(1);A.crack(1,false);return out;});
console.log(name,JSON.stringify(r),'errs',errs);await ctx.close();}
await br.close();})();
