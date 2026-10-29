const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src)(m);const S=m.exports;
for(const id of process.argv.slice(2)){
const T=S.buildTrack(S.TRACKS.find(t=>t.id===id));
const team=S.TEAMS[3];const car=new S.Car(T,team,team.drivers[0],{});const ai=new S.AIDriver(car,1.0,1);
car.place(T.n-20,T.lineO[T.n-20],0);car.dist=car.s-T.length;
const dt=1/360;let t=0,last=-99,hist=[];
while(t<200){const inp=ai.control(dt,[car],null);car.step(dt,inp);t+=dt;
 hist.push(`t=${t.toFixed(2)} idx=${car.idx} v=${(car.vx*3.6).toFixed(0)} vT=${(T.lineV[car.idx]*3.6).toFixed(0)} d=${car.d.toFixed(1)} o=${T.lineO[car.idx].toFixed(1)} R=${(1/T.lineK[car.idx]).toFixed(0)} st=${inp.steer.toFixed(2)} thr=${inp.throttle.toFixed(2)} brk=${inp.brake.toFixed(2)} aR=${car.slipR.toFixed(3)} aF=${car.slipF.toFixed(3)} imp=${car.impact.toFixed(1)}`);
 if(hist.length>400)hist.shift();
 if((Math.abs(car.d)>T.hw+1.4||car.impact>0)&&t-last>20){last=t;console.log('---',id);for(let k=0;k<hist.length;k+=36)console.log(hist[k]);}
}}
