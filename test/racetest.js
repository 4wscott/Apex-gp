const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src)(m);const S=m.exports;
const id=process.argv[2]||'parco';const T=S.buildTrack(S.TRACKS.find(t=>t.id===id));
const race=new S.Race(T,{mode:'race',laps:3,opponents:21,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],gridSlot:10,assist:{tc:2,abs:true,autoGear:true}});
// player is driven by an AI for the test
const pai=new S.AIDriver(race.player,0.98,99);
let rec=0;race.ais.concat([pai]).forEach(a=>{const o=a.recover.bind(a);a.recover=()=>{rec++;console.log("recover",a.car.driver.code,"t",race.greenT.toFixed(1),"lap",a.car.lap,"idx",a.car.idx,"d",a.car.d.toFixed(1),"v",a.car.vx.toFixed(1));o();}});
const dt=1/360;let t=0;const t0=Date.now();
while(t<700){const inp=pai.control(dt,race.cars,race);race.step(dt,inp);t+=dt;if(race.finishOrder.length>=race.cars.length)break;}
console.log(id,'sim time',t.toFixed(0),'s, wall',Date.now()-t0,'ms, recoveries',rec,'finished',race.finishOrder.length);
race.results().slice(0,22).forEach((r,i)=>console.log(String(i+1).padStart(2),r.car.driver.code,r.car.team.name.padEnd(20),'grid',r.car.gridPos,'laps',r.laps,'total',(r.total).toFixed(2),'best',r.best.toFixed(2),r.car===race.player?'<- player':''));
const ev={};race.events.forEach(e=>ev[e.type]=(ev[e.type]||0)+1);console.log(ev);
