// Practice stress: random/hostile inputs, walls, gravel, resets, setups; report the first non-finite car field
const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src+'\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS};')(m);const S=m.exports;
let bad=0;
for(const tr of S.TRACKS){ for(const seed of [1,2,3]){
 const T=S.buildTrack(tr);const race=new S.Race(T,{mode:'practice',laps:5,opponents:3,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],assist:{tc:seed%3,abs:seed!==2,autoGear:seed!==3}});
 const P=race.player;P.p.ClA*=1+0.025*(seed-2)*5;P.p.CdA*=1+0.022*(seed-2)*5;P.bias=[0.52,0.56,0.6][seed-1];P.setupWear=1.13;P.p.gears=P.p.gears.map(v=>v*(1+0.035*(seed-2)));
 let rs=seed*99991;const rnd=()=>{rs=(rs*16807)%2147483647;return rs/2147483647;};
 let inp={steer:0,throttle:1,brake:0};
 for(let n=0;n<360*240;n++){
  if(n%180===0)inp={steer:(rnd()*2-1)*(rnd()<0.3?1:0.3),throttle:rnd()<0.8?1:0,brake:rnd()<0.15?1:0,shiftUp:rnd()<0.05,shiftDown:rnd()<0.05,aero:rnd()<0.1,overtake:rnd()<0.1,ers:rnd()<0.02,biasF:rnd()<0.02,biasR:rnd()<0.02};
  race.step(1/360,inp);
  if(n%(360*20)===0&&!P.pit){const d0=P.dist;P.place(P.idx,T.lineO[P.idx],0);P.dist=d0;P.lastS=P.s;}
  const badk=Object.keys(P).filter(k=>typeof P[k]==='number'&&!Number.isFinite(P[k])&&!/best|Best/.test(k));
  if(badk.length){console.log(tr.id,'seed',seed,'t',race.time.toFixed(2),'NON-FINITE',badk.join(','),'surface',P.surface,'v',P.vx,'pit',!!P.pit);bad++;break;}
 }
}}
console.log('done, bad runs:',bad);
