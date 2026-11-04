const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src+'\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS};')(m);const S=m.exports;
const T=S.buildTrack(S.TRACKS.find(t=>t.id==='riviera'));
const race=new S.Race(T,{mode:'practice',laps:3,opponents:3,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],assist:{tc:2,abs:true,autoGear:true}});const P=race.player;const ai=new S.AIDriver(P,0.97,3);
let fin=0;for(let n=0;n<360*60*16&&P.lap<13;n++){race.step(1/360,ai.control(1/360,race.cars,race));for(const e of race.events)if(e.type==='finish')fin++;race.events.length=0;}
console.log('laps',P.lap-1,'finished flag',P.finished,'finish events',fin,'phase',race.phase,'wear',P.wear.toFixed(2),'traffic laps',race.cars.filter(c=>c!==P).map(c=>c.lap-1).join(','),'finished traffic',race.cars.filter(c=>c.finished).length);
