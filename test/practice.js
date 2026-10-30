const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src)(m);const S=m.exports;
const T=S.buildTrack(S.TRACKS.find(t=>t.id==='silver'));
const race=new S.Race(T,{mode:'practice',laps:5,opponents:6,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],assist:{tc:2,abs:true,autoGear:true}});
console.log('phase',race.phase,'cars',race.cars.length,'spread (m):',race.cars.map(c=>Math.round(((c.dist%T.length)+T.length)%T.length)).join(' '));
const pai=new S.AIDriver(race.player,0.97,9);const dt=1/360;let t=0;
while(t<600){race.step(dt,pai.control(dt,race.cars,race));t+=dt;}
const laps=race.events.filter(e=>e.type==='lap'&&e.car===race.player);
console.log('player laps',race.player.lap-1,'finished',race.player.finished,'finishOrder',race.finishOrder.length,'lap events',laps.length,laps.slice(0,6).map(e=>e.time&&e.time.toFixed(2)).join(' '));
