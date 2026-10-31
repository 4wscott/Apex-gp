// Does wall damage make the car spin? AI laps with healthy vs damaged car, and after real wall hits
const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src+'\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS};')(m);const S=m.exports;
const T=S.buildTrack(S.TRACKS.find(t=>t.id===(process.argv[2]||'silver')));
const lap=(setup,label)=>{const race=new S.Race(T,{mode:'practice',laps:5,opponents:0,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],assist:{tc:2,abs:true,autoGear:true}});
 const P=race.player;setup(P,race);const ai=new S.AIDriver(P,0.97,3);let spins=0,was=false,maxR=0,t=0;const snap={};
 for(let n=0;n<360*90;n++){race.step(1/360,ai.control(1/360,race.cars,race));if(P.spin&&!was)spins++;was=P.spin;maxR=Math.max(maxR,Math.abs(P.r));}
 console.log(label.padEnd(26),'spins',spins,'laps',P.lap-1,'best',P.lapTimes.length?Math.min(...P.lapTimes).toFixed(1):'-','maxYaw',maxR.toFixed(2),'wing',P.wingHealth.toFixed(2),'tempF/R',P.tempF.toFixed(0)+'/'+P.tempR.toFixed(0),'vy',P.vy.toFixed(2));};
lap(()=>{}, 'healthy');
lap(P=>{P.wingHealth=0.5},'wing 50%');
lap(P=>{P.wingHealth=0},'wing broken');
// real hits: drive into the wall 4 times at speed, then let the AI drive
lap((P,race)=>{for(let k=0;k<4;k++){P.vx=55;P.h+=0.5;for(let n=0;n<360*1.5;n++)race.step(1/360,{steer:0.6,throttle:1,brake:0});P.h-=0.5;const d0=P.dist;P.place(P.idx,T.lineO[P.idx],0);P.dist=d0;P.lastS=P.s;}
  const keys=['wingHealth','tempF','tempR','wear','r','vy','slipF','slipR','spin','lockF','lockR','bias','gear','reverse','surface','dirty','tow'];console.log('  after hits:',keys.map(k=>k+'='+(typeof P[k]==='number'?P[k].toFixed(2):P[k])).join(' '));},'after 4 real wall hits');
// where does the big yaw come from after the hits?
{const race=new S.Race(T,{mode:'practice',laps:5,opponents:0,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],assist:{tc:2,abs:true,autoGear:true}});const P=race.player;
for(let k=0;k<4;k++){P.vx=55;P.h+=0.5;for(let n=0;n<360*1.5;n++)race.step(1/360,{steer:0.6,throttle:1,brake:0});P.h-=0.5;const d0=P.dist;P.place(P.idx,T.lineO[P.idx],0);P.dist=d0;P.lastS=P.s;}
const ai=new S.AIDriver(P,0.97,3);let last=-9;
for(let n=0;n<360*90;n++){const inp=ai.control(1/360,race.cars,race);race.step(1/360,inp);if(Math.abs(P.r)>1.2&&race.time-last>2){last=race.time;console.log('  yaw',P.r.toFixed(2),'t',race.time.toFixed(1),'v',(P.vx*3.6).toFixed(0),'d',P.d.toFixed(1),'surface',P.surface,'slipF',P.slipF.toFixed(2),'slipR',P.slipR.toFixed(2),'tF',P.tempF.toFixed(0),'tR',P.tempR.toFixed(0),'steer',inp.steer.toFixed(2),'thr',inp.throttle.toFixed(2),'impact',P.impact.toFixed(1),'stuck',ai.stuckT.toFixed(1));}}}
