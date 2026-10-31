const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src+'\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS};')(m);const S=m.exports;
const T=S.buildTrack(S.TRACKS.find(t=>t.id==='silver'));
const race=new S.Race(T,{mode:'practice',laps:5,opponents:0,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],assist:{tc:2,abs:true,autoGear:true}});const P=race.player;const ai=new S.AIDriver(P,0.9,3);
const msgs=[];let offs=0,wasOff=false,lapAt=0;
for(let n=0;n<360*200&&P.lap<3;n++){const c=ai.control(1/360,race.cars,race);
  // in lap 1, swerve off the track three times (each about 1.5 s apart), then drive normally
  const t=race.time-lapAt;if(P.lap===1&&[[20,21],[30,31],[40,41]].some(([a,b])=>t>a&&t<b))c.steer=0.9;
  race.step(1/360,c);const L=P.lap;for(const e of race.events)if(e.type==='msg')msgs.push('lap '+P.lap+': '+e.text);else if(e.type==='lap'&&e.car===P){msgs.push(`lap ${e.lap||L-1} finished ${e.time.toFixed(1)} s, valid=${e.valid}`);lapAt=race.time;}race.events.length=0;}
console.log(msgs.join('\n'));
