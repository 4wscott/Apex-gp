const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src)(m);const S=m.exports;
const [id,weather,laps]=[process.argv[2]||'parco',process.argv[3]||'wet',+(process.argv[4]||5)];
const T=S.buildTrack(S.TRACKS.find(t=>t.id===id));
const race=new S.Race(T,{mode:'race',laps,weather,opponents:11,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],gridSlot:6,assist:{tc:2,abs:true,autoGear:true}});
if(race.rainPlan){race.rainPlan.start=60;race.rainPlan.length=200;race.rainPlan.peak=0.85;}
const pai=new S.AIDriver(race.player,0.95,99);let rec=0;race.ais.concat([pai]).forEach(a=>{const o=a.recover.bind(a);a.recover=()=>{rec++;if(process.env.V)console.log('recover',a.car.driver.code,'t',race.time.toFixed(0),'tyre',a.car.compound,'wet',race.env.wet.toFixed(2),'d',a.car.d.toFixed(1),'v',a.car.vx.toFixed(1),'idx',a.car.idx);o();}});
const dt=1/360;let t=0,lastP=-1;
while(t<2000){
  // the AI-driven player follows the same tyre logic as the AI
  race.aiPitDecision(race.player);
  race.step(dt,pai.control(dt,race.cars,race));t+=dt;
  const p=Math.floor(t/60);if(p!==lastP){lastP=p;console.log(`t=${t.toFixed(0)} rain ${race.env.rain.toFixed(2)} wet ${race.env.wet.toFixed(2)} tyres ${race.cars.map(c=>c.compound).join('')} lap ${race.player.lap}`);}
  if(race.finishOrder.length>=race.cars.length)break;}
const ev={};race.events.forEach(e=>{if(['rainstart','rainstop','pitentry','yellow','vsc'].includes(e.type))ev[e.type]=(ev[e.type]||0)+1;});
console.log(JSON.stringify(ev),'recoveries',rec,'finished',race.finishOrder.length,'/',race.cars.length,'time',t.toFixed(0));
console.log('best laps',race.results().slice(0,3).map(r=>r.best.toFixed(2)).join(' '));
