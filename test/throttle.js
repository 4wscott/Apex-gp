// Practice laps driven with real key presses through the game loop: any frame where the car accelerates with no throttle key held?
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const level of (process.argv[2]||'beginner,intermediate').split(',')){
const page=await br.newPage({viewport:{width:640,height:360}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((lv)=>{const L={beginner:{tc:2,abs:true,steerAssist:true,stab:2,brakeAssist:true,aiPace:0.88},intermediate:{tc:1,abs:true,steerAssist:true,stab:1,brakeAssist:false,aiPace:0.96}}[lv];localStorage.setItem('apexgp.settings',JSON.stringify(Object.assign({quality:0,v:7,mode:'practice',track:'silver',camera:'chase',radio:'text'},L)))},level);
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
const r=await page.evaluate(()=>{App.render=()=>{};const S=App.session,r=S.race,P=r.player,keys=App.input.keys,ai=new SIM.AIDriver(P,0.95,3);let t=performance.now();const out=[];let laps=P.lap,prevV=P.vx;let bad=0,firstBad=null,off=0;
  for(let n=0;n<60*260;n++){
    // a keyboard player: what the AI would do, as key presses
    const c=ai.control(1/60,r.cars,r);keys.clear();
    if(c.throttle>0.3&&c.brake<0.1)keys.add('KeyA');if(c.brake>0.1)keys.add('KeyD');if(c.steer>0.2)keys.add('ArrowLeft');if(c.steer<-0.2)keys.add('ArrowRight');
    // and every 5 seconds: let go of everything for 1.5 s
    const coast=(n%300)>210;if(coast)keys.clear();
    t+=1000/60;App.frame(t);
    const thrKey=keys.has('KeyA');off=thrKey?0:off+1;
    if(off>18&&P.vx>prevV+0.05&&P.vx>5&&!P.pit){bad++;if(!firstBad)firstBad={n,lap:P.lap,v:Math.round(P.vx*3.6),thr:P.throttle,inpThr:App.input.state.throttle,dev:App.input.lastDevice,assist:P.assisting,pit:!!P.pit,surface:P.surface,ot:P.overtakeOn};}
    prevV=P.vx;if(P.lap!==laps){out.push('lap '+laps+' done '+(P.lapTimes.at(-1)||0).toFixed(1));laps=P.lap;}
  }keys.clear();return {out,bad,firstBad,lap:P.lap};});
console.log(level,JSON.stringify(r),errs);await page.close();}
await br.close();})();
