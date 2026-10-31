// Phase 1: an on/off "keyboard driver" on each difficulty (spins, offs, lap time), and wall-hit behaviour
const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src+'\nmodule.exports={buildTrack,TRACKS,Race,AIDriver,TEAMS};')(m);const S=m.exports;
const LEVELS={beginner:{tc:2,abs:true,steerAssist:true,stab:2,brakeAssist:true},intermediate:{tc:1,abs:true,steerAssist:true,stab:1,brakeAssist:false},pro:{tc:0,abs:false,steerAssist:false,stab:0,brakeAssist:false},old_default:{tc:2,abs:true,steerAssist:true,stab:0,brakeAssist:false}};
const run=(tid,lv,late)=>{const T=S.buildTrack(S.TRACKS.find(t=>t.id===tid));const a=LEVELS[lv];
 const race=new S.Race(T,{mode:'practice',laps:5,opponents:0,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],assist:{tc:a.tc,abs:a.abs,autoGear:true,stab:a.stab,brakeAssist:a.brakeAssist}});
 const P=race.player;const ai=new S.AIDriver(P,1.04,5);let spins=0,was=false,offs=0,wasOff=false,maxSlip=0;
 for(let n=0;n<360*170;n++){const c=ai.control(1/360,race.cars,race);
   // keyboard-style: on/off steering, full throttle, brakes late (or not at all when braking assist is on and "late" is set)
   let st=Math.abs(c.steer)>0.22?Math.sign(c.steer):0;if(a.steerAssist)st*=1/Math.sqrt(1+(Math.max(0,P.vx)/40)**2);
   const inp={steer:st,throttle:c.brake>0.1?0:(c.throttle>0.3?1:0),brake:late&&a.brakeAssist?0:(c.brake>0.1?1:0)};
   race.step(1/360,inp);
   const so=P.vx>-1&&Math.hypot(P.vx,P.vy)>6&&Math.abs(Math.atan2(P.vy,Math.max(0.1,P.vx)))>1.0;if(so&&!was)spins++;was=so;const off=Math.abs(P.d)>T.hw+1.5;if(off&&!wasOff)offs++;wasOff=off;maxSlip=Math.max(maxSlip,Math.abs(P.slipR));}
 return `${lv.padEnd(13)} spins ${String(spins).padStart(3)} offs ${String(offs).padStart(3)} laps ${P.lap-1} best ${P.lapTimes.length?Math.min(...P.lapTimes).toFixed(1):'-'} maxRearSlip ${maxSlip.toFixed(2)}`;};
for(const tid of ['silver','riviera','parco']){console.log('==',tid);for(const lv of Object.keys(LEVELS))console.log(' ',run(tid,lv,false));console.log(' ',run(tid,'beginner',true).replace('beginner     ','beginner(no brake pedal)'));}
// wall: glancing vs head-on
const T=S.buildTrack(S.TRACKS.find(t=>t.id==='silver'));
for(const [label,ang] of [['glancing 12deg',0.21],['medium 30deg',0.52],['head-on 70deg',1.2]]){
 const race=new S.Race(T,{mode:'practice',laps:5,opponents:0,team:S.TEAMS[3],driver:S.TEAMS[3].drivers[0],assist:{tc:2,abs:true,autoGear:true}});const P=race.player;
 const i=Math.round(800/T.ds);P.place(i,0,60);P.h=Math.atan2(T.ty[i],T.tx[i])+ang;let hit=null,after=null;
 for(let n=0;n<360*2;n++){race.step(1/360,{steer:0,throttle:0.5,brake:0});if(P.impact>0&&!hit)hit={n,yaw:0};if(hit&&n===hit.n+108&&!after)after={v:P.vx*3.6,yaw:Math.abs(P.r),head:Math.abs(Math.atan2(P.vy,P.vx))};}
 console.log(label.padEnd(16),'0.3 s after contact:',after?`${after.v.toFixed(0)} km/h of 216, yaw ${after.yaw.toFixed(2)}, slide angle ${after.head.toFixed(2)}`:'no hit','wing',P.wingHealth.toFixed(2));}
