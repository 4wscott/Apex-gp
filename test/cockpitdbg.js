const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await br.newPage({viewport:{width:960,height:540}});
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('http://local/',r=>r.fulfill({body:html,contentType:'text/html'}));
await page.addInitScript(()=>{try{localStorage.setItem('apexgp.settings','{"quality":1,"mirrors":true,"v":2,"camera":"cockpit","team":"taurus"}')}catch(e){}});
await page.goto('http://local/');await page.evaluate(()=>{});await page.waitForTimeout(6000);
await page.evaluate(()=>{window.THREE_V0=App.camera.position.constructor;});await page.evaluate(()=>{SIM.settings.mode='race';SIM.settings.track='parco';SIM.settings.opponents=3;SIM.settings.camera='cockpit';App.start();});await page.waitForTimeout(7000);
console.log(await page.evaluate(()=>{const m=App.session.race.player.mesh,b=m.body;b.updateMatrixWorld(true);const out=[];
for(const a of m.arms){const k=m.avatar.ik[a.sd<0?0:1];const S=k.up.getWorldPosition(new THREE_V0()),E=k.fore.getWorldPosition(new THREE_V0()),H=k.hand.getWorldPosition(new THREE_V0()),T=a.hand.getWorldPosition(new THREE_V0());
const loc=(v)=>{const w=b.worldToLocal(v.clone());return w.toArray().map(x=>x.toFixed(2)).join(',')};
out.push({sd:a.sd,shoulder:loc(S),elbow:loc(E),hand:loc(H),target:loc(T),reach:(S.distanceTo(E)+E.distanceTo(H)).toFixed(2),need:S.distanceTo(T).toFixed(2)});}
return out;}));
await page.screenshot({path:SP+'ck0.png',timeout:120000});
// side view of the player's car with cockpit parts shown
await page.evaluate(()=>{const P=App.session.race.player;App.session.camMode='chase';window.DEBUG_CAM2=true;P.mesh.swTilt.visible=true;});
const shot=async(name,off,look)=>{await page.evaluate(([off,look])=>{const P=App.session.race.player,m=P.mesh;m.helmet.visible=true;if(m.avatar)m.avatar.root.visible=true;const b=m.body;b.updateMatrixWorld(true);const p=new THREE_V(off,b),l=new THREE_V(look,b);window.DEBUG_CAM=[p.x-P.x,p.y,p.z+P.y,l.x-P.x,l.y,l.z+P.y];},[off,look]);await page.waitForTimeout(2500);await page.screenshot({path:SP+name,timeout:120000});};
await page.evaluate(()=>{window.THREE_V=function(a,b){const v=b.localToWorld(new (b.position.constructor)(a[0],a[1],a[2]));return v;};});
await shot('ck1.png',[0.2,1.2,-1.6],[0.15,0.7,0]);
console.log('errs',errs);await br.close();})();
