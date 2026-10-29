const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const src=fs.readFileSync(path.join(__dirname,'../src/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/sim.js'),'utf8');
const m={exports:{}};new Function('module',src)(m);const S=m.exports;
let html='<body style="margin:0;background:#fff;display:flex;flex-wrap:wrap">';
for(const spec of S.TRACKS){const T=S.buildTrack(spec);const b=T.bounds;const w=b.maxX-b.minX,h=b.maxY-b.minY;const sc=380/Math.max(w,h);
 let pts='';for(let i=0;i<T.n;i+=2)pts+=`${((T.px[i]-b.minX)*sc+10).toFixed(1)},${(390-(T.py[i]-b.minY)*sc).toFixed(1)} `;
 let line='';for(let i=0;i<T.n;i+=2)line+=`${((T.lx[i]-b.minX)*sc+10).toFixed(1)},${(390-(T.ly[i]-b.minY)*sc).toFixed(1)} `;
 html+=`<svg width=400 height=420><text x=10 y=412 font-size=14>${spec.id} ${T.length|0}m</text><polygon points="${pts}" fill=none stroke=#333 stroke-width=${Math.max(1,spec.width*sc)} /><polyline points="${line}" fill=none stroke=red stroke-width=0.7 /><circle cx=${(T.px[0]-b.minX)*sc+10} cy=${390-(T.py[0]-b.minY)*sc} r=5 fill=lime /></svg>`;}
(async()=>{const br=await chromium.launch();const p=await br.newPage({viewport:{width:1600,height:860}});await p.setContent(html);await p.screenshot({path:process.argv[2]||'/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/tracks.png'});await br.close();})();
