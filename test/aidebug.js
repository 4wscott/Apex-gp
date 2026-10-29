const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src)(m);const S=m.exports;
const T=S.buildTrack(S.TRACKS.find(t=>t.id===(process.argv[2]||'parco')));
const team=S.TEAMS[3];const car=new S.Car(T,team,team.drivers[0],{});const ai=new S.AIDriver(car,1.0,1);
car.place(T.n-20,T.lineO[T.n-20],0);car.dist=car.s-T.length;
const dt=1/360;let t=0,last=-99;let fr=0;
while(t<130){const inp=ai.control(dt,[car],null);car.step(dt,inp);t+=dt;fr++;
 if(fr%180==0||(Math.abs(car.d)>T.hw+1.4&&t-last>2)){ if(Math.abs(car.d)>T.hw+1.4) last=t;
  console.log(`t=${t.toFixed(1)} idx=${car.idx} v=${(car.vx*3.6).toFixed(0)} vT=${(T.lineV[car.idx]*3.6).toFixed(0)} d=${car.d.toFixed(1)} lineO=${T.lineO[car.idx].toFixed(1)} k=${(T.lineK[car.idx]*1000).toFixed(1)} st=${inp.steer.toFixed(2)} thr=${inp.throttle.toFixed(2)} brk=${inp.brake.toFixed(2)} aR=${car.slipR.toFixed(3)} aF=${car.slipF.toFixed(3)} tF=${car.tempF.toFixed(0)} surf=${car.surface} g=${car.gear}`);}
}
