// practice: 2 warnings then delete; HUD tags for braking assist, box request and pit lane; no text selection; stuck-touch guard
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,vp,touch] of [['pc',{width:1280,height:720},false],['iphone',{width:844,height:390},true]]){
const ctx=await br.newContext({viewport:vp,hasTouch:touch,isMobile:touch});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:7,mode:'practice',track:'silver',camera:'chase',radio:'text',brakeAssist:true,stab:2}))});
await page.goto('http://local/');await page.waitForTimeout(6000);
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
const msgs=await ev(()=>{const r=App.session.race,P=r.player,T=r.track,out=[];P.lapValid=true;P.lapWarn=0;P.dist=600;
  for(let k=0;k<3;k++){P.d=T.hw+2;P.offTrack=false;const save=P.locate;P.locate=()=>{};r.progress(P);P.locate=save;r.events.filter(e=>e.type==='msg').forEach(e=>out.push(e.text));r.events.length=0;P.offTrack=false;}
  out.push('lap valid now: '+P.lapValid);return out;});
console.log(name,'track limits:',JSON.stringify(msgs));
// braking assist tag: arrive fast at a corner
const ba=await ev(()=>{const r=App.session.race,P=r.player,T=r.track;let i=0;for(let k=0;k<T.n;k++)if(T.lineV[k]<30){i=k;break;}const s0=(i-Math.round(90/T.ds)+T.n)%T.n;P.place(s0,T.lineO[s0],75);let seen=false;for(let n=0;n<40;n++){App.frame(performance.now()+16*n);if(!document.querySelector('#h-ba').hidden)seen=true;}return seen;});
// box request tag
const box=await ev(()=>{const P=App.session.race.player;App.session.race.requestPit(P,'S');Hud.t=1;Hud.update(0.1,App.session,{});return document.querySelector('#h-boxreq').textContent+' | shown '+!document.querySelector('#h-boxreq').hidden;});
console.log(' brake assist tag shown when assisting:',ba,'| box tag:',box);
console.log(' text selection disabled:',await ev(()=>getComputedStyle(document.body).userSelect||getComputedStyle(document.body).webkitUserSelect));
if(touch){ // hold throttle, then a touchend with no fingers left must release it
  console.log(' stuck-touch guard:',await ev(()=>{const st=App.input.touch;st.thr=1;window.dispatchEvent(Object.assign(new Event('touchend'),{touches:[]}));return 'throttle after all fingers up = '+st.thr;}));}
console.log(' page responsive:',await ev(()=>1+1));
console.log(' errs',errs);await ctx.close();}
await br.close();})();
