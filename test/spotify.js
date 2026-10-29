// Spotify flow against a mocked Spotify (no account needed): sign-in redirect, token exchange, playlists, play/next
const fs=require('fs');const path=require('path');const {chromium}=require('playwright');
const SP='/tmp/claude-0/-home-user/08ac67dc-84d5-5534-8a2f-b2fb411fe5b9/scratchpad/';
const html='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+fs.readFileSync(path.join(__dirname,'../index.html'),'utf8')+'</body></html>';
(async()=>{const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await br.newPage({viewport:{width:1100,height:700}});
const errs=[];page.on('pageerror',e=>errs.push(e.message));const calls=[];
await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(SP+'t160/package/'+u.pathname.replace('/npm/three@0.160.0/',''),'utf8'),contentType:'application/javascript'});});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
await page.route('https://apexgp.test/**',r=>r.fulfill({body:html,contentType:'text/html'}));
let authUrl=null;
await page.route('https://accounts.spotify.com/authorize**',r=>{authUrl=r.request().url();r.fulfill({contentType:'text/html',body:'<p>Spotify sign-in (mock)</p>'});});
await page.route('https://accounts.spotify.com/api/token',r=>{calls.push('token '+new URLSearchParams(r.request().postData()).get('grant_type'));r.fulfill({contentType:'application/json',body:JSON.stringify({access_token:'AT',refresh_token:'RT',expires_in:3600})});});
let playing=true;
await page.route('https://api.spotify.com/v1/**',r=>{const u=new URL(r.request().url()),m=r.request().method();calls.push(m+' '+u.pathname);
  if(u.pathname==='/v1/me/player'&&m==='GET')return r.fulfill({contentType:'application/json',body:JSON.stringify({is_playing:playing,device:{name:"Scott's iPhone"},item:{name:'Hardstyle Anthem',artists:[{name:'DJ Test'}]}})});
  if(u.pathname==='/v1/me/playlists')return r.fulfill({contentType:'application/json',body:JSON.stringify({items:[{name:'Race Day',uri:'spotify:playlist:abc'},{name:'Hardstyle Hits',uri:'spotify:playlist:def'}]})});
  if(u.pathname==='/v1/me/player/pause'){playing=false;return r.fulfill({status:204});}
  if(u.pathname==='/v1/me/player/play'){playing=true;calls.push('  body '+r.request().postData());return r.fulfill({status:204});}
  return r.fulfill({status:204});});
await page.addInitScript(()=>{try{if(!localStorage.getItem('apexgp.settings'))localStorage.setItem('apexgp.settings','{"quality":0,"v":2}')}catch(e){}});
await page.goto('https://apexgp.test/');await page.waitForTimeout(5000);
await page.evaluate(()=>{[...document.querySelectorAll('.tab')].find(t=>t.dataset.panel==='p-gfx').click();document.querySelector('[data-set="musicSource"] [data-v="spotify"]').click();});
await page.waitForTimeout(500);
await page.evaluate(()=>{const i=document.querySelector('#sp-client');i.value='0123456789abcdef0123456789abcdef';i.dispatchEvent(new Event('change'));setTimeout(()=>document.querySelector('#sp-login').click(),50);});
await page.waitForURL(/accounts\.spotify\.com/,{timeout:20000});await page.waitForTimeout(500);await page.goto(new URL(authUrl).searchParams.get('redirect_uri')+'?code=TESTCODE');await page.waitForTimeout(8000);
const au=new URL(authUrl);console.log('authorize params',{client:au.searchParams.get('client_id'),redirect:au.searchParams.get('redirect_uri'),pkce:au.searchParams.get('code_challenge_method'),scopes:au.searchParams.get('scope').split(' ').length});
console.log('errs so far',errs);console.log('after return url',page.url(),'connected',await page.evaluate(()=>window.Spotify&&window.Spotify.connected&&window.Spotify.connected()), await page.evaluate(()=>Object.keys(window.Spotify||{}).slice(0,5)));
await page.waitForTimeout(1500);
console.log('now playing:',await page.textContent('#sp-now'),'| playlists:',await page.evaluate(()=>[...document.querySelectorAll('#sp-list option')].map(o=>o.textContent).join(', ')));
await page.evaluate(()=>{document.querySelector('#sp-list').value='spotify:playlist:def';document.querySelector('#sp-playlist').click();});await page.waitForTimeout(800);
await page.evaluate(()=>document.querySelector('#sp-next').click());await page.waitForTimeout(800);
await page.evaluate(()=>document.querySelector('#sp-pp').click());await page.waitForTimeout(800);
await page.screenshot({path:SP+'spotify.png'});
console.log('calls',calls.join(' | '));console.log('errs',errs);await br.close();})();
