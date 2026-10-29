// two players in separate browser contexts, connected through the real PeerJS broker
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
async function player(_,name,team){const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-features=WebRtcHideLocalIpsWithMdns']});const ctx=await br.newContext({viewport:{width:640,height:360}});const page=await ctx.newPage();page.errs=[];page.on('pageerror',e=>page.errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript((t)=>{try{localStorage.setItem('apexgp.settings',JSON.stringify({quality:0,mirrors:false,v:2,camera:'chase',team:t,mode:'online',laps:2}))}catch(e){}},team);
await page.goto('http://local/');await page.waitForTimeout(7000);await page.evaluate((n)=>{document.querySelector('#on-name').value=n;},name);return page;}
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-features=WebRtcHideLocalIpsWithMdns']});
const A=await player(br,'Scott','taurus'), B=await player(br,'Friend','rossa');
console.log('peerjs loaded', await A.evaluate(()=>Net.available()));
await A.evaluate(()=>document.querySelector('#on-create').click());await A.waitForFunction(()=>Net.code&&Net.me,null,{timeout:30000});const code=await A.evaluate(()=>Net.code);console.log('room',code, await A.textContent('#on-msg'));
await B.evaluate((c)=>{document.querySelector('#on-code').value=c;document.querySelector('#on-join').click();},code);try{await B.waitForFunction(()=>Net.me,null,{timeout:30000});}catch(e){console.log('B status:',await B.textContent('#on-msg'));console.log(await B.evaluate(()=>{const c=Net.conns[0];return {peerOpen:Net.peer.open,peerId:Net.peer.id,conn:!!c,connOpen:c&&c.open,ice:c&&c.peerConnection&&c.peerConnection.iceConnectionState,sig:c&&c.peerConnection&&c.peerConnection.signalingState};}));console.log('A conns',await A.evaluate(()=>Net.conns.map(c=>({open:c.open,ice:c.peerConnection&&c.peerConnection.iceConnectionState}))));throw e;}
await A.waitForFunction(()=>Net.players.length===2,null,{timeout:20000});
console.log('A lobby',await A.evaluate(()=>[...document.querySelectorAll('#on-players li')].map(l=>l.textContent)),'B msg',await B.textContent('#on-msg'));
await A.evaluate(()=>document.querySelector('#on-start').click());
await Promise.all([A,B].map(p=>p.waitForFunction(()=>App.session&&App.session.online,null,{timeout:30000})));
console.log('lights setup',await A.evaluate(()=>[App.session.race.lightsT.toFixed(2),App.session.race.lightsOutAt.toFixed(2)]),await B.evaluate(()=>[App.session.race.lightsT.toFixed(2),App.session.race.lightsOutAt.toFixed(2)]));
await Promise.all([A,B].map(p=>p.evaluate(()=>{const r=App.session.race;r.lightsT=r.lightsOutAt-0.2;})));
await Promise.all([A,B].map(p=>p.waitForFunction(()=>App.session.race.phase==='green',null,{timeout:60000})));
console.log('both green');
// A drives forward for 4 s; B should see A's car move
await A.keyboard.down('a');await A.waitForTimeout(12000);
const aState=await A.evaluate(()=>{const P=App.session.race.player;return {x:+P.x.toFixed(1),y:+P.y.toFixed(1),kmh:Math.round(P.vx*3.6)};});
const bSees=await B.evaluate(()=>{const c=App.session.race.cars.find(c=>c.remote);return {name:c.driver.name,x:+c.x.toFixed(1),y:+c.y.toFixed(1),kmh:Math.round(c.vx*3.6),visible:c.mesh.grp.visible};});
await A.keyboard.up('a');
console.log('A real',aState,' B sees A',bSees);
await B.screenshot({path:SP+'online-b.png',timeout:120000});
console.log('tower B',await B.evaluate(()=>[...document.querySelectorAll('#tower .row, #tower li, #tower tr')].slice(0,3).map(r=>r.textContent.trim().replace(/\s+/g,' '))));
console.log('errs',A.errs.slice(0,3),B.errs.slice(0,3));process.exit(0);})();
