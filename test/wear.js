const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src)(m);const S=m.exports;
const T=S.buildTrack(S.TRACKS.find(t=>t.id===(process.argv[2]||'parco')));
const race=new S.Race(T,{mode:'race',laps:4,opponents:3,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],compound:'S',assist:{tc:2,abs:true,autoGear:true}});
const pai=new S.AIDriver(race.player,0.98,99);const dt=1/360;let t=0,lap=0;
while(t<500&&!race.player.finished){race.step(dt,pai.control(dt,race.cars,race));t+=dt;if(race.player.lap!==lap){lap=race.player.lap;console.log('lap',lap,'wear S',race.player.wear.toFixed(3),'others',race.cars.filter(c=>c!==race.player).map(c=>c.compound+':'+c.wear.toFixed(3)).join(' '),'lapT',race.player.lastLap&&race.player.lastLap.toFixed(2));}}
