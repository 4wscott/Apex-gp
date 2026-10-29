const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src)(m);const S=m.exports;
const only=process.argv[2];
for(const spec of S.TRACKS){ if(only&&spec.id!==only)continue;
  const t0=Date.now();const T=S.buildTrack(spec);const bt=Date.now()-t0;
  // AI lap
  const team=S.TEAMS[3];const car=new S.Car(T,team,team.drivers[0],{assist:{tc:2,abs:true,autoGear:true}});
  const ai=new S.AIDriver(car,1.0,1);car.place(T.n-20,T.lineO[T.n-20],0);car.dist=car.s-T.length;
  const dt=1/360;let t=0,laps=[],lastLap=0,rec=0,maxD=0,vmax=0,wallHits=0,offs=0;
  const origRec=ai.recover.bind(ai);ai.recover=()=>{rec++;origRec();};
  while(t<600&&laps.length<3){const inp=ai.control(dt,[car],null);car.step(dt,inp);t+=dt;
    const c=Math.floor(car.dist/T.length);if(c>laps.length-1+0&&car.dist>0&&c>=1+laps.length-1){} 
    if(car.dist>=(laps.length+1)*T.length){laps.push(t-lastLap);lastLap=t;}
    maxD=Math.max(maxD,Math.abs(car.d)-T.hw);vmax=Math.max(vmax,car.vx);if(car.impact>0)wallHits++; if(Math.abs(car.d)>T.hw+1.4)offs++;}
  console.log(`${spec.id.padEnd(9)} L=${T.length.toFixed(0)}m close=${T.closeErr.toFixed(1)} minSep=${T.minSep.toFixed(1)} corners=${T.corners} zones=${T.aeroZone.reduce((a,b)=>a+b,0)*T.ds|0}m build=${bt}ms | laps=${laps.map(x=>x.toFixed(2)).join(',')} vmax=${(vmax*3.6).toFixed(0)} rec=${rec} wall=${wallHits} offFrames=${offs} maxOver=${maxD.toFixed(1)}`);
}
