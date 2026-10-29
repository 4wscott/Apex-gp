// Writes music.wav and engine.wav (rendered offline in the browser) to the scratchpad for listening.
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP0='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/', OUT=process.argv[2]||SP0;
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
function wav(file,ch,SR){const n=ch[0].length,buf=Buffer.alloc(44+n*4);buf.write('RIFF',0);buf.writeUInt32LE(36+n*4,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(2,22);buf.writeUInt32LE(SR,24);buf.writeUInt32LE(SR*4,28);buf.writeUInt16LE(4,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(n*4,40);for(let i=0;i<n;i++)for(let c=0;c<2;c++)buf.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(ch[c][i]*32767))),44+i*4+c*2);fs.writeFileSync(file,buf);}
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await br.newPage();
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP0+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.goto('http://local/');await page.waitForTimeout(4000);
const SR=32000;
const music=await page.evaluate(async(SR)=>{
  const secs=52, ctx=new OfflineAudioContext(2, SR*secs, SR);
  const nb=ctx.createBuffer(1,SR*2,SR),d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  const master=ctx.createGain();master.gain.value=1;master.connect(ctx.destination);
  const m=new AUDIO.Music({ctx,master,noiseBuf:nb});m.init();m.on=true;m.bus.gain.value=0.9;m.makeSong();
  m.next=0.05;m.step=0;const sx=60/150/4;while(m.next<secs-0.5){m.play(m.step,m.next);m.step++;m.next+=sx;}
  const b=await ctx.startRendering();return [Array.from(b.getChannelData(0)),Array.from(b.getChannelData(1))];},SR);
wav(OUT+'music.wav',music,SR);
const engine=await page.evaluate(async(SR)=>{
  const secs=14, off=new OfflineAudioContext(2,SR*secs,SR); const AC=window.AudioContext; window.AudioContext=function(){return off;};
  const e=new AUDIO.AudioEngine(); e.start(); window.AudioContext=AC; e.setVolume(0.9);
  // scripted run: launch, upshifts, rev limiter, lift (crackle), braking with downshift blips, back on throttle
  const gears=[82,122,158,192,228,264,302,348], red=12500, dt=0.032; let v=0,g=0;
  const P={rpm:4000,throttle:1,vx:0,slipF:0,slipR:0,surface:'tarmac',p:{redline:red},justShifted:0};
  const step=(t)=>{
    const phase=t<5.2?'acc':t<6.6?'limiter':t<7?'lift':t<10.5?'brake':'acc', kmh=v*3.6;
    P.throttle=phase==='acc'||phase==='limiter'?1:0;
    if(phase==='acc'){ v+=(t>10.5?6:8)*dt; if(kmh/gears[g]*red>12100&&g<7&&t<5.2){g++;P.justShifted=1;} }
    if(phase==='limiter') v=Math.min(v+1*dt, gears[g]/3.6*1.01);
    if(phase==='brake'){ v=Math.max(18,v-30*dt); if(g>0&&kmh/gears[g-1]*red<10500){g--;P.justShifted=-1;} }
    P.rpm=Math.min(red+150,Math.max(4200,v*3.6/gears[g]*red)); P.vx=v;
    e.update(dt,{player:P,inCockpit:true,crowd:0});
  };
  const N=Math.floor((secs-0.2)/dt); for(let k=0;k<N;k++) off.suspend(k*dt).then(()=>{step(k*dt);off.resume();});
  const b=await off.startRendering(); return [Array.from(b.getChannelData(0)),Array.from(b.getChannelData(1))];},SR).catch(e=>String(e));
if(typeof engine!=='string') wav(OUT+'engine.wav',engine,SR);
console.log(typeof engine==='string'?engine:'engine ok');
console.log('errs',errs);await br.close();})();
