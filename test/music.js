// Renders 60 s of the procedural music offline and reports levels per section (no speakers needed).
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});const page=await br.newPage();
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.goto('http://local/');await page.waitForTimeout(4000);
const res=await page.evaluate(async()=>{
  const SR=22050, secs=48, ctx=new OfflineAudioContext(2, SR*secs, SR);
  const nb=ctx.createBuffer(1,SR*2,SR),d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  const master=ctx.createGain();master.gain.value=1;master.connect(ctx.destination);
  const audio={ctx,master,noiseBuf:nb};const m=new AUDIO.Music(audio);m.init();m.on=true;m.level=1;m.duck=1;m.bus.gain.value=0.9;m.makeSong();
  m.next=0.05;m.step=0;const sx=60/150/4;while(m.next<secs-0.5){m.play(m.step,m.next);m.step++;m.next+=sx;}
  const buf=await ctx.startRendering(),L=buf.getChannelData(0);
  const sec=[];for(let s=0;s<secs;s+=2){let pk=0,ss=0;for(let i=s*SR;i<(s+2)*SR;i++){const v=Math.abs(L[i]);pk=Math.max(pk,v);ss+=v*v;}sec.push([s,+pk.toFixed(2),+Math.sqrt(ss/(2*SR)).toFixed(3)]);}
  return sec;});
console.log('t(s) peak rms   (bar = 1.6 s; intro 0-12.8, break 12.8-25.6, drop 25.6-51.2)');res.forEach(r=>console.log(r.join('  ')));
console.log('errs',errs);await br.close();})();
