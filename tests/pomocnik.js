// Společné pomůcky pro automatické testy. Testy spouští prohlížeč Chromium bez okna
// a s předstíraným spojením (bez serveru PeerJS), takže běží i bez internetu.
const {chromium}=require('playwright');
const path=require('path');
const APP=process.env.APP_PATH||'index.html';
const URL='file://'+path.resolve(__dirname,'..',APP);

// Náhrada knihovny PeerJS: spojení se jen předstírá.
const FAKE_PEER=`(()=>{window.Peer=function(id){const h={},self={id,destroyed:false,disconnected:false,
  on(e,f){h[e]=f},reconnect(){},destroy(){self.destroyed=true},connect(){return{on(){},close(){},open:false}}};
  setTimeout(()=>h.open&&h.open(),5);return self};
  try{Object.defineProperty(navigator,'wakeLock',{value:{request(){return Promise.resolve({})}}})}catch(e){}})();`;

let browser=null;
async function prohlizec(){if(!browser)browser=await chromium.launch();return browser}
async function zavri(){if(browser){await browser.close();browser=null}}

async function stranka(viewport={width:390,height:844}){
  const b=await prohlizec();
  const ctx=await b.newContext({viewport,screen:viewport});
  await ctx.addInitScript(FAKE_PEER);
  await ctx.route('**/peerjs.min.js',r=>r.abort());
  const p=await ctx.newPage();
  const chyby=[];p.on('pageerror',e=>chyby.push(e.message));p.chyby=chyby;
  await p.goto(URL);
  await p.evaluate(()=>{try{localStorage.clear()}catch(e){}});
  await p.reload();
  return p;
}

// Spustí ovladač; volitelně zapne EKG, SpO2 a EtCO2 a předstírá připojený monitor.
async function ovladac(opts={}){
  const p=await stranka(opts.viewport);
  await p.fill('#code','482915');await p.click('#bCtl');await p.waitForTimeout(60);
  await p.evaluate(()=>{window.__odeslano=[];conns=[{open:true,send(x){__odeslano.push(JSON.parse(JSON.stringify(x)))}}];send()});
  if(opts.senzory){await p.click('#ecgbtn');await p.click('#tg_spo2');await p.click('#co2btn')}
  return p;
}
// Spustí monitor; stav pacienta se nastavuje funkcí stav(p, {...}).
async function monitor(opts={}){
  const p=await stranka(opts.viewport||{width:844,height:390});
  await p.fill('#code','482915');await p.click('#bMon');await p.waitForTimeout(60);
  await p.evaluate(()=>{sndOn=false;window.__udalosti=[];monConn=()=>({open:true,send:d=>{if(d.ev)__udalosti.push(d.ev.text)}})});
  return p;
}
const stav=(p,s)=>p.evaluate(s=>{handleState({...DEF,ecgon:true,hron:true,spo2on:true,co2on:true,...s})},s);
const text=(p,id)=>p.evaluate(id=>document.getElementById(id).textContent.trim(),id);
const alarm=p=>text(p,'alm');
const rytmus=(p,k)=>p.click(`#rhy-chips button[data-k=${k}]`);
const posun=(p,k,v)=>p.evaluate(([k,v])=>{const i=document.getElementById('s_'+k);i.value=v;i.dispatchEvent(new Event('input'))},[k,v]);
const S=p=>p.evaluate(()=>S);

module.exports={stranka,ovladac,monitor,stav,text,alarm,rytmus,posun,S,zavri,APP};
