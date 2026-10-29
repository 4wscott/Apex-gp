const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src)(m);const S=m.exports;
const T=S.buildTrack(S.TRACKS.find(t=>t.id===(process.argv[2]||'parco')));
const race=new S.Race(T,{mode:'race',laps:+(process.argv[3]||8),opponents:15,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],gridSlot:15,assist:{tc:2,abs:true,autoGear:true}});
Math.random=(()=>{let x=1;return()=>{x=(x*16807)%2147483647;return (x%1000)/1000*0.4;};})();
const pai=new S.AIDriver(race.player,0.9,99);const dt=1/360;let t=0;
// force an incident: stop a midfield car off track on lap 3
let forced=false;
while(t<1400){ if(!forced&&race.cars[5].lap===3){const c=race.cars[5];c.place(c.idx,T.hw+4,0);forced=true;const ai=race.ais.find(a=>a.car===c);ai.stuckT=-6;}
  race.step(dt,pai.control(dt,race.cars,race));t+=dt;if(race.finishOrder.length>=race.cars.length)break;}
const ev={};race.events.forEach(e=>{if(['yellow','vsc','vscending','vscend','blue','msg','pitentry'].includes(e.type))(ev[e.type]=ev[e.type]||[]).push(e.t.toFixed(0)+(e.text?':'+e.text:''));});
console.log(JSON.stringify(ev,null,1));console.log('finished',race.finishOrder.length,'/',race.cars.length);
