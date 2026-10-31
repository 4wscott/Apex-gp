// Full game loop in practice: hostile driving, real reset presses (R key / Reset button), pit requests; checks car state + mesh
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await br.newPage({viewport:{width:640,height:360}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('**/iframe_api',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((t)=>{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,v:6,mode:'practice',track:t,camera:'chase',traffic:5}))},process.argv[2]||'silver');
await page.goto('http://local/');await page.waitForTimeout(6000);
await page.evaluate(()=>document.querySelector('#start').click());await page.waitForTimeout(7000);
const r=await page.evaluate(()=>{
  const out=[];let t=performance.now();const realRender=App.render.bind(App);App.render=()=>{};
  const S=App.session,P=S.race.player;const keys=App.input.keys;let rs=7;const rnd=()=>{rs=(rs*16807)%2147483647;return rs/2147483647;};
  const check=(n,tag)=>{const bad=['x','y','h','vx','vy','r','s','d','idx','dist','wear','tempF','tempR','soc','rpm'].filter(k=>!Number.isFinite(P[k]));const m=P.mesh.grp;
    const mb=[m.position.x,m.position.z].some(v=>!Number.isFinite(v))||!m.visible||!m.parent;const far=Math.hypot(m.position.x-P.x,-m.position.z-P.y);
    if(bad.length||mb||far>3)out.push(`${tag} frame ${n}: bad=${bad} meshBad=${mb} meshFar=${far.toFixed(1)} pit=${P.pit&&P.pit.phase} x=${P.x}`);};
  for(let n=0;n<3000;n++){
    if(n%40===0){keys.clear();if(rnd()<0.85)keys.add('KeyA');if(rnd()<0.4)keys.add(rnd()<0.5?'ArrowLeft':'ArrowRight');if(rnd()<0.1)keys.add('KeyD');}
    if(n%250===125){keys.add('KeyR');}
    if(n%250===127){keys.delete('KeyR');check(n,'after reset');}
    if(n===200){keys.add('KeyM');} if(n===202)keys.delete('KeyM');if(n===1200){App.togglePause(true);document.querySelector('#p-garage').click();}
    if(n%60===0&&P.pit)out.push('pit '+P.pit.phase+' s='+P.pit.s.toFixed(0)+' frame '+n);
    t+=1000/[60,144,30,60][Math.floor(n/750)];App.frame(t);
    if(n%25===0)check(n,'drive');
    if(out.filter(x=>!x.startsWith('pit')).length>6)break;
  }
  App.render=realRender;keys.clear();
  return {issues:out,pit:P.pit&&P.pit.phase,x:P.x,frames:3000};
});
console.log(JSON.stringify(r,null,1));console.log('errs',errs.slice(0,5));
await br.close();})();
