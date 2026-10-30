const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src)(m);const S=m.exports;
const id=process.argv[2]||'parco', laps=+(process.argv[3]||10);
const T=S.buildTrack(S.TRACKS.find(t=>t.id===id));
const race=new S.Race(T,{mode:'race',laps,opponents:11,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],gridSlot:6,assist:{tc:2,abs:true,autoGear:true}});
const pai=new S.AIDriver(race.player,0.98,99);let rec=0;
race.ais.concat([pai]).forEach(a=>{const o=a.recover.bind(a);a.recover=()=>{rec++;console.log('recover',a.car.driver.code,'t',race.time.toFixed(0),'pit?',!!a.car.pit,'since exit',(race.time-(a.car.lastExit||-99)).toFixed(1),'d',a.car.d.toFixed(1),'v',a.car.vx.toFixed(1));o();}});
const dt=1/360;let t=0,asked=false;
console.log('pit lane',JSON.stringify({a:race.pit.a,L:race.pit.L.toFixed(0),boxes:[0,5,10].map(k=>race.pit.boxS(k).toFixed(0)).join('/')}),'wearMul',race.wearMul.toFixed(1));
while(t<1500){
  if(!asked&&race.player.lap===Math.ceil(laps/2)){race.requestPit(race.player,'H');asked=true;}
  race.step(dt,pai.control(dt,race.cars,race));t+=dt;race.events.forEach(e=>{if(e.type==='pitexit')e.car.lastExit=e.t;});if(race.finishOrder.length>=race.cars.length)break;}
const ev=race.events.filter(e=>e.type.startsWith('pit'));
const per={};ev.forEach(e=>{const k=e.car.driver.code;(per[k]=per[k]||[]).push(e.type[3]+'@'+e.t.toFixed(0));});
console.log('pit events',Object.entries(per).map(([k,v])=>k+':'+v.join(',')).join('  '));
console.log('recoveries',rec,'finished',race.finishOrder.length,'/',race.cars.length,'sim',t.toFixed(0),'s');
race.results().forEach((r,i)=>console.log(String(i+1).padStart(2),r.car.driver.code,'pen',r.car.penalty,'used',(r.car.usedCompounds||[]).join(''),'stops',r.car.stops,'tyre',r.car.compound,'wear',r.car.wear.toFixed(2),'total',r.total.toFixed(1),r.car===race.player?'<- player':''));
