/* Simulátor monitoru pacienta – ovladač (lektor) a monitor (studenti) v jednom skriptu.
   Číslo verze se mění jen tady. */
const APP_VERSION='v86';
const $=id=>document.getElementById(id);
document.querySelectorAll('[data-ver]').forEach(e=>{e.textContent=e.dataset.ver.replace('{v}',APP_VERSION)});
const RHY={sinus:['Sinusový rytmus',75],tachy:['Sinusová tachykardie',130],brady:['Sinusová bradykardie',40],af:['Fibrilace síní',110],flutter:['Flutter síní',150],vt:['Komorová tachykardie',180],pvt:['KT bez pulzu',190],vf:['Fibrilace komor',0],asys:['Asystolie',0],av3:['AV blokáda III. st.',35],pea:['PEA',60],tdp:['Torsades de pointes',220],ste:['Elevace ST',80]};
/* rytmy bez pulzu (zástava oběhu); KT bez pulzu je defibrilovatelný rytmus jako VF */
const NOPULSE=['vf','pvt','asys','pea','tdp'];
/* povolený rozsah tepu podle rytmu (aby název rytmu odpovídal frekvenci) */
const HRR={sinus:[50,100],tachy:[101,180],brady:[30,59],af:[50,180],flutter:[60,170],vt:[120,250],pvt:[120,250],vf:[0,0],asys:[0,0],av3:[20,60],pea:[20,150],tdp:[150,250],ste:[50,120]};
const hrClamp=o=>{const r=HRR[o.rhythm]||[0,250];o.hr=Math.max(r[0],Math.min(r[1],+o.hr||0));return o};
/* TK: systolický vždy aspoň o 20 vyšší než diastolický */
const bpFix=(o,k)=>{if(o.sys<=0&&o.dia<=0)return o;if(k==='dia'){if(o.dia>o.sys-20)o.sys=Math.min(260,o.dia+20);if(o.dia>o.sys-20)o.dia=o.sys-20}else if(o.dia>o.sys-20)o.dia=Math.max(0,o.sys-20);return o};
const LIMR={hr:['Srdeční frekvence','#0ca678',20,250,5],spo2:['SpO₂','#1c7ed6',50,100,1],sys:['TK systolický','#e03131',40,260,5],etco2:['EtCO₂','#f76707',5,80,1]};
const LIMDEF={hr:[50,120],spo2:[90,100],sys:[90,180],etco2:[30,50]};
const FIELDS=[['hr','Srdeční frekvence (/min)',0,250],['spo2','SpO₂ (%)',50,100],['sys','TK systolický (mmHg)',0,260],['dia','TK diastolický (mmHg)',0,160],['etco2','EtCO₂ (mmHg)',0,80],['rr','Dechová frekvence (/min)',0,60]];
const DEF={rhythm:'sinus',hr:75,spo2:98,sys:120,dia:80,etco2:38,rr:14,ecgon:false,hron:false,spo2on:false,syson:true,co2on:false,kpr:false,lim:LIMDEF};
let C={...DEF}, S={...DEF}, code='', mode='', lastRx=0, dev='';

/* při každém spuštění nový náhodný 6místný kód */
try{localStorage.removeItem('simcode')}catch(e){}
{let n;try{const a=new Uint32Array(1);crypto.getRandomValues(a);n=a[0]%900000}catch(e){n=Math.floor(Math.random()*900000)}code=String(100000+n)}
$('code').value=code;

try{dev=localStorage.getItem('simdev')||''}catch(e){}
$('bMon').onclick=()=>{if(!getCode())return;if(!dev)dev=Math.min(screen.width,screen.height)>=700?'pc':'phone';startMon()};
function show(id){['home','ctl','mon'].forEach(x=>$(x).classList.toggle('hide',x!==id));document.body.classList.toggle('lightbg',id==='ctl');document.documentElement.classList.toggle('lightbg',id==='ctl')}

function getCode(){code=($('code').value||'').replace(/\D/g,'').slice(0,6);if(code.length<6){$('code').focus();$('codehint').classList.add('err');return false}$('codehint').classList.remove('err');return true}
function fail(m){if(mode==='ctl'){$('cst').textContent=m;$('cdot').classList.remove('ok')}else{$('noroom').textContent=m;$('noroom').classList.remove('hide')}}
let conns=[];

/* ---------- Ovladač ---------- */
function buildCtl(){
  const rc=$('rhy-chips');rc.innerHTML='';
  for(const k in RHY){const b=document.createElement('button');b.textContent=RHY[k][0];b.dataset.k=k;
    b.onclick=()=>{if(S.ecgon===false)return;const dead=NOPULSE.includes(k),was=NOPULSE.includes(S.rhythm);S.rhythm=k;S.hr=RHY[k][1];hrClamp(S);if(!dead)S.kpr=false;
      /* SpO2 se u rytmů bez pulzu nemění – monitor ji stejně ukáže jako --- */
      if(dead){S.sys=0;S.dia=0}else if(was){S.sys=120;S.dia=80}sync()};rc.appendChild(b)}
  $('ecgbtn').onclick=()=>{S.ecgon=(S.ecgon===false);sync(false)};
  const sl=$('sliders');sl.innerHTML='';
  for(const [k,l,mi,ma] of FIELDS){
    const d=document.createElement('div');d.className='row';
    d.innerHTML=k==='etco2'?`<label><span>${l} <button type="button" id="co2btn" class="mini"></button></span><span id="o_${k}"></span></label><input type="range" id="s_${k}" min="${mi}" max="${ma}" step="1">`:`<label><span>${l}</span><span id="o_${k}"></span></label><input type="range" id="s_${k}" min="${mi}" max="${ma}" step="1">`;
    sl.appendChild(d);
    if(TG[k]){const b=document.createElement('button');b.type='button';b.id='tg_'+k;b.className='mini';d.querySelector('label span').appendChild(b);b.onclick=()=>{const v=(S[TG[k]]===false);S[TG[k]]=v;if(k==='spo2')S.hron=v;sync(false)}}
    if(k==='etco2')$('co2btn').onclick=()=>{S.co2on=(S.co2on===false);sync(false)};
    d.querySelector('input').oninput=e=>{S[k]=+e.target.value;if(k==='hr')hrClamp(S);bpFix(S,k);sync(k==='hr'||k==='sys'||k==='dia')};
    {const i=d.querySelector('input'),w=document.createElement('div');w.className='adj';i.before(w);
     const mk=(t,dir)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.setAttribute('aria-label',(dir<0?'Snížit: ':'Zvýšit: ')+l);
      let to=0,iv=0;
      const step=()=>{const r=k==='hr'?(HRR[S.rhythm]||[mi,ma]):[mi,ma],v=Math.max(r[0],Math.min(r[1],S[k]+dir));if(v===S[k])return;S[k]=v;bpFix(S,k);sync()};
      const stop=()=>{clearTimeout(to);clearInterval(iv)};
      b.onpointerdown=e=>{e.preventDefault();stop();if(b.disabled)return;step();to=setTimeout(()=>{iv=setInterval(step,70)},450)};
      b.onpointerup=b.onpointerleave=b.onpointercancel=stop;
      b.oncontextmenu=e=>e.preventDefault();
      b.onclick=e=>{if(e.detail===0&&!b.disabled)step()};
      return b};
     w.append(mk('−',-1),i,mk('+',1))}
  }
  $('kprb').onclick=()=>{if(!NOPULSE.includes(S.rhythm))return;S.kpr=!S.kpr;if(S.kpr){S.rr=10;S.etco2=10}sync()};
  const lw=$('lims');lw.innerHTML='';
  for(const k in LIMR){const [n,c,mi,ma,stp]=LIMR[k],row=document.createElement('div');row.className='limrow';row.style.setProperty('--k',c);
    row.innerHTML=`<div class="limname"><i></i>${n}</div><div class="limsteps"></div>`;lw.appendChild(row);
    [0,1].forEach(j=>{const box=document.createElement('div');box.className='lstep';box.innerHTML=`<small>${j?'max':'min'}</small>`;
      const val=document.createElement('b');val.id=`lim_${k}_${j}`;
      const mk=(t,dir)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.setAttribute('aria-label',(dir<0?'Snížit ':'Zvýšit ')+(j?'max ':'min ')+n);
        let to=0,iv=0;const step=()=>{const L=[...S.lim[k]];let v=L[j]+dir*stp;v=j?Math.max(L[0]+stp,Math.min(ma,v)):Math.max(mi,Math.min(L[1]-stp,v));if(v===L[j])return;L[j]=v;S.lim={...S.lim,[k]:L};sync(false)};
        const stop=()=>{clearTimeout(to);clearInterval(iv)};
        b.onpointerdown=e=>{e.preventDefault();stop();if(b.disabled)return;step();to=setTimeout(()=>{iv=setInterval(step,90)},450)};
        b.onpointerup=b.onpointerleave=b.onpointercancel=stop;b.oncontextmenu=e=>e.preventDefault();b.onclick=e=>{if(e.detail===0&&!b.disabled)step()};return b};
      box.append(mk('−',-1),val,mk('+',1));row.querySelector('.limsteps').appendChild(box)})}
}
function paintCtl(setSliders=true){
  document.querySelectorAll('#rhy-chips button').forEach(b=>b.classList.toggle('on',b.dataset.k===S.rhythm));
  for(const [k] of FIELDS){$('o_'+k).textContent=S[k];const i=$('s_'+k);if(setSliders)i.value=S[k];i.style.setProperty('--p',(S[k]-i.min)/(i.max-i.min)*100+'%')}
  const eo=S.ecgon!==false,eb=$('ecgbtn');eb.textContent=eo?'ZAP':'VYP';eb.classList.toggle('on',eo);$('rhy-chips').style.opacity=eo?1:.4;$('rhy-chips').querySelectorAll('button').forEach(b=>b.disabled=!eo);
  const on=S.co2on!==false,cb=$('co2btn');
  cb.textContent=on?'ZAP':'VYP';cb.classList.toggle('on',on);
  for(const k in TG){const o=S[TG[k]]!==false,b=$('tg_'+k);b.textContent=o?'ZAP':'VYP';b.classList.toggle('on',o)}
  /* hodnoty, které monitor nezobrazuje, nejdou měnit */
  const arr=NOPULSE.includes(S.rhythm),hz=HRR[S.rhythm]||[0,250],ih=$('s_hr');ih.min=hz[0];ih.max=Math.max(hz[1],hz[0]+1);ih.value=S.hr;ih.style.setProperty('--p',hz[1]>hz[0]?(S.hr-hz[0])/(hz[1]-hz[0])*100+'%':'0%');
  /* u rytmů bez pulzu nejde nastavovat SpO2 ani tlak; u VF a asystolie ani tep */
  const en={hr:(S.ecgon!==false||S.spo2on!==false)&&hz[1]>0,spo2:S.spo2on!==false&&!arr,sys:!arr,dia:!arr,etco2:S.co2on!==false,rr:S.co2on!==false};
  for(const k in en){const i=$('s_'+k);i.disabled=!en[k];i.closest('.adj').querySelectorAll('button').forEach(b=>b.disabled=!en[k]);i.closest('.row').classList.toggle('off',!en[k])}
  const kp=S.kpr===true;$('kprc').classList.toggle('on',kp);$('kprc').classList.toggle('dis',!arr);$('kprb').disabled=!arr;$('kprb').textContent=kp?'VYPNOUT':'ZAPNOUT';$('kprs').textContent=!arr?'jen při zástavě oběhu (VF, KT bez pulzu, asystolie, PEA, torsades)':kp?'probíhá – rušení na EKG a pletysmografu':'rušení na EKG a pletysmografu';
  for(const k in LIMR)[0,1].forEach(j=>{$(`lim_${k}_${j}`).textContent=S.lim[k][j]});
  document.querySelectorAll('#ctl .mini').forEach(b=>{b.setAttribute('role','switch');b.setAttribute('aria-checked',b.classList.contains('on'))});
}
let tmr=0;
const TG={spo2:'spo2on'};
const sig=o=>[o.rhythm,o.hr,o.spo2,o.sys,o.dia,o.etco2,o.rr,o.co2on!==false,o.hron!==false,o.spo2on!==false,o.syson!==false,o.ecgon!==false,o.kpr===true,JSON.stringify(o.lim)].join('|');
let autoSend=false;try{autoSend=localStorage.getItem('simauto')==='1'}catch(e){}
function saveState(){try{localStorage.setItem('simstate',JSON.stringify({S,C}))}catch(e){}}
function loadState(){try{const o=JSON.parse(localStorage.getItem('simstate')||'null');if(!o||!o.S||!o.C||!RHY[o.S.rhythm]||!RHY[o.C.rhythm])return;
  /* po novém spuštění jsou senzory i KPR vypnuté; rytmus, hodnoty a hranice alarmů zůstanou */
  const fix=x=>{const n={...DEF,...x,syson:true,ecgon:false,hron:false,spo2on:false,co2on:false,kpr:false};n.lim={...LIMDEF,...(x.lim||{})};n.spo2=Math.max(50,Math.min(100,+n.spo2||98));hrClamp(n);bpFix(n,'sys');return n};S=fix(o.S);C=fix(o.C)}catch(e){}}
/* text tlačítka na jeden řádek: když se delší verze nevejde (malý displej, široké písmo), použije se kratší */
function fitText(el,variants){for(const t of variants){el.textContent=t;if(el.scrollWidth<=el.clientWidth)return}}
addEventListener('resize',()=>{if(mode==='ctl')dirtyPaint()});
function dirtyPaint(){
  const d=sig(S)!==sig(C),b=$('upd'),a=$('autob');
  a.classList.toggle('on',autoSend);a.setAttribute('role','switch');a.setAttribute('aria-checked',autoSend);
  b.classList.toggle('auto',autoSend);
  if(autoSend){b.disabled=true;b.classList.remove('on');fitText(b,['Změny se odesílají ihned','Odesílá se ihned','Ihned']);return}
  b.disabled=!d;b.classList.toggle('on',d);
  fitText(b,d?['UPDATE – odeslat změny','UPDATE – odeslat','UPDATE']:['Žádné změny k odeslání','Žádné změny']);
}
function commit(){clearTimeout(tmr);tmr=0;C={...S};send();saveState();dirtyPaint()}
$('upd').onclick=commit;
$('autob').onclick=()=>{autoSend=!autoSend;try{localStorage.setItem('simauto',autoSend?'1':'0')}catch(e){}if(autoSend&&sig(S)!==sig(C))commit();else dirtyPaint()};
function sync(full=true){
  paintCtl(full);
  saveState();
  if(autoSend&&!tmr)tmr=setTimeout(commit,150);
  dirtyPaint();
}
function send(){
  let n=0;
  conns.forEach(c=>{if(c.open){try{c.send(C);n++}catch(e){}}});
  if(fbCtl){fbCtl.room.update({state:{...C,t:fbTS()},t:fbTS()}).catch(()=>{});n+=fbCtl.mons()}
  $('cdot').classList.toggle('ok',n>0);
  $('ccode').textContent=code;$('cst').textContent=n>1?'Připojeno: '+n+' monitory':n?'Připojeno':'Čekám na monitor';
}
$('bCtl').onclick=()=>{
  if(!getCode())return;
  if(typeof Peer==='undefined'&&typeof firebase==='undefined'){fail('Nepodařilo se načíst službu pro spojení. Zkontroluj připojení k internetu.');return}
  $('bCtl').disabled=true;let tries=0,started=false,viaFb=false;
  /* spuštění ovladače smí proběhnout jen jednou ('open' PeerJS přijde i po znovupřipojení) */
  const ui=()=>{if(started)return;started=true;$('noroom').classList.add('hide');mode='ctl';loadState();show('ctl');buildCtl();paintCtl();dirtyPaint();send();setInterval(send,2000);miniPaint();miniSize();setInterval(miniPaint,1000);ctlWake();document.addEventListener('visibilitychange',ctlWake);requestAnimationFrame(miniFrame)};
  const start=()=>{
    const p=new Peer('ecgsim-'+code);ctlPeer=p;
    p.on('open',()=>{if(!viaFb)ui()});
    p.on('connection',c=>{conns.push(c);c.on('data',d=>{if(!d||typeof d!=='object')return;if(d.mon&&typeof d.mon==='object')miniData(d.mon);if(d.ev&&typeof d.ev==='object')miniEvent(d.ev)});c.on('open',()=>send());c.on('close',()=>{conns=conns.filter(x=>x!==c);send()});c.on('error',()=>{})});
    p.on('error',e=>{
      if(viaFb)return; /* hlavní spojení přes Firebase běží – chyby zálohy PeerJS nevadí */
      /* kód může být chvíli po odchodu z ovladače ještě obsazený – zkusit znovu */
      if(e.type==='unavailable-id'&&!started&&tries<5){tries++;fail('Kód se uvolňuje, zkouším znovu… ('+tries+'/5)');try{p.destroy()}catch(x){}setTimeout(start,2500);return}
      if(!started)$('bCtl').disabled=false;
      fail(e.type==='unavailable-id'?'Tento kód už někdo používá. Zvol jiný.':'Chyba spojení: '+e.type)});
    p.on('disconnected',()=>{try{if(!p.destroyed)p.reconnect()}catch(e){}});
  };
  /* nejdřív Firebase; PeerJS běží souběžně jako záloha pro monitory bez Firebase */
  fail('Připojuji…');
  fbCtlStart().then(()=>{viaFb=true;ui()}).catch(e=>{if(!started&&String(e&&e.message)==='obsazeno'){viaFb=true;$('bCtl').disabled=false;fail('Tento kód už někdo používá. Zvol jiný.');try{ctlPeer&&ctlPeer.destroy()}catch(x){}}});
  if(typeof Peer!=='undefined')start();
};
let ctlPeer=null;
/* ---------- Firebase Realtime Database (hlavní spojení; PeerJS je záloha) ----------
   Hodnoty jdou přes běžné zabezpečené webové spojení (port 443), takže projdou i sítěmi,
   které blokují přímé spojení mezi zařízeními. Konfigurace není tajná – přístup hlídají pravidla databáze. */
const FB_CONFIG={apiKey:"AIzaSyAkQBKtefk5GHRSQtXl1sfAoYjqAVprvvA",authDomain:"simulator-monitoru-pacienta.firebaseapp.com",
  databaseURL:"https://simulator-monitoru-pacienta-default-rtdb.europe-west1.firebasedatabase.app",projectId:"simulator-monitoru-pacienta",
  storageBucket:"simulator-monitoru-pacienta.firebasestorage.app",messagingSenderId:"784927985435",appId:"1:784927985435:web:e2e81bd398c9df023f0dbe"};
const FB={p:null,db:null,uid:null};
const fbTS=()=>firebase.database.ServerValue.TIMESTAMP;
function fbInit(){
  if(FB.p)return FB.p;
  FB.p=new Promise((res,rej)=>{
    if(typeof firebase==='undefined'||!firebase.database||!firebase.auth)return rej(new Error('knihovna Firebase se nenačetla'));
    try{
      const app=firebase.apps.length?firebase.app():firebase.initializeApp(FB_CONFIG),auth=firebase.auth(app),db=firebase.database(app);
      const emu=new URLSearchParams(location.search).get('emu'); /* jen pro automatické testy s lokálním emulátorem */
      if(emu&&/^[\w.-]+$/.test(emu)){auth.useEmulator('http://'+emu+':9099',{disableWarnings:true});db.useEmulator(emu,9000)}
      const to=setTimeout(()=>rej(new Error('Firebase neodpovídá')),12000);
      auth.signInAnonymously().then(c=>{clearTimeout(to);FB.db=db;FB.uid=c.user.uid;res(FB)}).catch(e=>{clearTimeout(to);rej(e)});
    }catch(e){rej(e)}});
  FB.p.catch(()=>{FB.p=null});
  return FB.p;
}
/* ovladač: založí místnost s kódem; do 'state' zapisuje jen on, monitory zapisují do 'mon/<id>' */
let fbCtl=null;
async function fbCtlStart(){
  const f=await fbInit(),room=f.db.ref('rooms/'+code);
  const r=await room.transaction(cur=>{if(cur&&cur.owner&&cur.owner!==f.uid&&cur.t>Date.now()-30000)return;return{owner:f.uid,t:fbTS()}},undefined,false);
  if(!r.committed)throw new Error('obsazeno');
  room.onDisconnect().remove();
  const last={};let mons=0;
  room.child('mon').on('value',sn=>{const v=sn.val()||{};const ids=Object.keys(v);mons=ids.length;let best=null;
    ids.forEach(id=>{const m=v[id]||{};if(m.snap&&(!best||(m.t||0)>(best.t||0)))best=m;
      if(m.ev&&typeof m.ev==='object'){if(last[id]!==undefined&&m.ev.n>last[id])miniEvent(m.ev);last[id]=m.ev.n}});
    if(best)miniData(best.snap);send()});
  fbCtl={room,mons:()=>mons};
}

/* ovladač: zabránit zhasnutí displeje (obnovit i po návratu do aplikace) */
function ctlWake(){try{if(navigator.wakeLock&&document.visibilityState==='visible')navigator.wakeLock.request('screen').catch(()=>{})}catch(e){}}
/* ---------- náhled monitoru v ovladači ---------- */
let miniLast=0,miniOpen=true;try{miniOpen=localStorage.getItem('simmini')!=='0'}catch(e){}
function miniData(m){miniLast=Date.now();const v=x=>String(x==null?'---':x).slice(0,9);
  $('mHr').textContent=v(m.hr);$('mSpo').textContent=v(m.spo2);$('mBp').textContent=v(m.bp);$('mCo').textContent=v(m.co2);
  const a=String(m.alm||'').trim(),al=$('malm');al.textContent=a.slice(0,60);al.classList.toggle('hide',!a);al.classList.toggle('w',!m.crit);
  devChip(m);$('mline').innerHTML=[['#2ee66b',m.hr],['#3aa0ff',m.spo2],['#fff',m.bp],['#ff9a2e',m.co2]].map(([c,x])=>'<b style="color:'+c+'">'+v(x).replace(/[<>&]/g,'')+'</b>').join(' ');miniPaint()}
function miniEvent(e){const txt=String(e.text||'').slice(0,60);if(!txt)return;const k=['shock','chg','pace','info'].includes(e.kind)?e.kind:'info';
  if(k==='shock'){const m=$('mini');m.classList.remove('shock');void m.offsetWidth;m.classList.add('shock');try{navigator.vibrate&&navigator.vibrate([120,60,120])}catch(x){}}}
function devChip(m){const d=m.df||{},p=m.pc||{},el=$('mdev');let t='',c='';
  if(d.st==='chg'){t='NABÍJÍ '+(+d.j||'')+' J';c='chg'}else if(d.st==='rdy'){t=d.pend?'ČEKÁ NA QRS':'PŘIPRAVEN '+(+d.j||'')+' J';c='rdy'}else if(d.st==='shk'){t='VÝBOJ!';c='shk'}
  else if(p.on){t='STIMULACE '+(+p.rate||'')+'/min · '+(+p.ma||0)+' mA';c='pace'}
  if(t&&d.sync&&d.st!=='shk')t+=' · SYNC';el.textContent=t;el.className='dv '+c+(t?'':' hide')}
function miniPaint(){const live=Date.now()-miniLast<4000;$('mdot').classList.toggle('ok',live);$('mini').classList.toggle('stale',!live);
  $('mini').classList.toggle('closed',!miniOpen);$('minih').setAttribute('aria-expanded',miniOpen);
  $('mmsg').textContent=!live?'Čekám na data z monitoru…':(C.ecgon===false?'EKG vypnuto':'');
  if(!live){['mHr','mSpo','mCo'].forEach(i=>$(i).textContent='---');$('mBp').textContent='---/---';$('malm').classList.add('hide');$('mdev').classList.add('hide');$('mline').textContent='čekám na monitor'}}
$('minih').onclick=()=>{miniOpen=!miniOpen;try{localStorage.setItem('simmini',miniOpen?'1':'0')}catch(e){}miniPaint();miniSize()};
let MX=0,MY=null,mprev=0;const mc=$('mc'),mx=mc.getContext('2d');
function miniSize(){const d=window.devicePixelRatio||1,w=mc.clientWidth,h=mc.clientHeight;if(!w)return;mc.width=w*d;mc.height=h*d;mx.setTransform(d,0,0,d,0,0);mx.lineWidth=1.6;mx.lineJoin='round';mx.strokeStyle='#2ee66b';MX=0;MY=null}
window.addEventListener('resize',()=>{if(mode==='ctl')miniSize()});
/* křivka se počítá stejným modelem jako na monitoru, z odeslaného stavu C */
function miniFrame(now){if(mode!=='ctl')return;requestAnimationFrame(miniFrame);
  const dt=Math.min(.1,(now-(mprev||now))/1000);mprev=now;if(!miniOpen||document.hidden)return;
  const w=mc.clientWidth,h=mc.clientHeight;if(!w||!h)return;
  if(Date.now()-miniLast>4000){if(MY!==null||MX){mx.clearRect(0,0,w,h);MX=0;MY=null}return}
  const keep=S;S=C;const steps=Math.max(1,Math.round(dt/.008)),hh=dt/steps;
  try{for(let i=0;i<steps;i++){st+=hh;sched();const v=C.ecgon===false||Date.now()-miniLast>4000?0:ecg(),y=h*.6-v*h*.42,nx=MX+70*hh;
    mx.beginPath();mx.moveTo(MX,MY===null?y:MY);mx.lineTo(nx,y);mx.stroke();mx.clearRect(nx+1,0,12,h);MX=nx;MY=y;if(MX>w){MX=0;MY=null;mx.clearRect(0,0,14,h)}}}
  finally{S=keep}}
window.addEventListener('pagehide',()=>{try{ctlPeer&&ctlPeer.destroy()}catch(e){}try{fbCtl&&fbCtl.room.remove()}catch(e){}});
$('cback').onclick=()=>{const d=!autoSend&&sig(S)!==sig(C);
  if(confirm('Opravdu odejít z ovladače?\n\nMonitor přestane dostávat hodnoty. Nastavení zůstane uložené a příště se obnoví.'+(d?'\n\nPozor: máš neodeslané změny.':''))){try{ctlPeer&&ctlPeer.destroy()}catch(e){}const go=()=>location.reload();if(fbCtl)fbCtl.room.remove().then(go,go);else go()}};
{const sh=$('almsheet'),open=o=>{sh.classList.toggle('hide',!o);$('calm').classList.toggle('on',o);if(o)$('almx').focus()};
 $('calm').onclick=()=>open(sh.classList.contains('hide'));$('almx').onclick=$('almbg').onclick=()=>open(false);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sh.classList.contains('hide'))open(false)})}
{const de=document.documentElement,req=de.requestFullscreen||de.webkitRequestFullscreen,fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement,
  cfs=$('cfs'),paint=()=>{const on=!!fsEl();cfs.textContent=on?'✕':'⛶';cfs.title=on?'Ukončit celou obrazovku':'Celá obrazovka';cfs.setAttribute('aria-label',cfs.title)};
 cfs.classList.toggle('hide',!req);
 cfs.onclick=async()=>{try{if(fsEl())await (document.exitFullscreen||document.webkitExitFullscreen).call(document);else await req.call(de)}catch(e){}};
 document.addEventListener('fullscreenchange',paint);document.addEventListener('webkitfullscreenchange',paint);}

/* ---------- Monitor ---------- */
const cv=[0,1,2].map(i=>$('c'+i)),cx=cv.map(c=>c.getContext('2d'));
const T=[{x:0,y:null},{x:0,y:null},{x:0,y:null}];
const COL=['#2ee66b','#3aa0ff','#ff9a2e'];
const SPEED=[110,110,40]; // px za sekundu (CSS px)
function resize(){
  cv.forEach((c,i)=>{const r={width:c.clientWidth,height:c.clientHeight},d=window.devicePixelRatio||1;
    c.width=Math.max(1,r.width*d);c.height=Math.max(1,r.height*d);cx[i].setTransform(d,0,0,d,0,0);cx[i].lineWidth=dev==='pc'?2.5:2;cx[i].lineJoin='round';
    c.style.width='100%';T[i].x=0;T[i].y=null;});
}
/* telefon na výšku: monitor se otočí o 90°, aby byl vždy na šířku (záloha, když prohlížeč nedovolí zamknout orientaci) */
function orient(){const m=$('mon'),rot=mode==='mon'&&dev!=='pc'&&innerHeight>innerWidth;m.classList.toggle('rot',rot);
  m.style.width=rot?innerHeight+'px':'';m.style.height=rot?innerWidth+'px':'';m.style.transform=rot?'translateX('+innerWidth+'px) rotate(90deg)':'';
  if(mode==='mon')resize()}
window.addEventListener('resize',()=>{if(mode==='mon')orient()});

const g=(x,m,s)=>Math.exp(-((x-m)**2)/(2*s*s));
let beatFlag=0,st=0,lastBeat=-9,nextBeat=0,rrBeat=0.8;
function sched(){
  const r=S.rhythm;
  if(st<shockEnd){lastBeat=-9;nextBeat=shockEnd;return}
  if(pFire()){
    const iv=60/pc.rate;
    if(pNext<=0||pNext>st+iv+1)pNext=st;
    while(st>=pNext){pLast=pNext;pNext+=iv;if(pCap()){lastBeat=pLast-.17;btype='p';rrBeat=iv;beatFlag=1;pulseBeep()}}
    if(pCap()){nextBeat=st+.5;return}
  }else{pNext=st+.3;pLast=-9}
  if(r==='vf'||r==='asys'||S.hr<=0){lastBeat=-9;nextBeat=st;return}
  while(st>=nextBeat){
    lastBeat=nextBeat;btype='n';beatFlag=1;pulseBeep();
    let rr=60/S.hr;
    if(r==='af')rr*=0.6+0.8*Math.random(); else if(r==='sinus'||r==='tachy'||r==='brady'||r==='ste'||r==='pea')rr*=1+0.015*Math.sin(st*0.8);
    rrBeat=rr;nextBeat=lastBeat+rr;
  }
}
/* KPR: komprese 110/min s mírně proměnlivou silou a tempem (návrh B) */
const KC={next:0,start:-9,dur:.55,amp:1};
const SHOCKP=3.2; /* délka pauzy po výboji [s] */
function kprStep(){if(KC.next<st-1)KC.next=st;while(st>=KC.next){const iv=60/110*(1+.06*(Math.random()*2-1));KC.start=KC.next;KC.dur=iv;KC.amp=1+.18*(Math.random()*2-1);KC.next+=iv}}
function kprShape(){if(KC.start<-5)return 0;const x=(st-KC.start)/KC.dur;if(x<0||x>1)return 0;
  if(x<0.42)return Math.pow(Math.sin(Math.PI*x/0.42),1.4);const t=(x-0.42)/0.58;return -0.28*Math.sin(Math.PI*t)*Math.exp(-1.5*t)}
function kprOn(){return S.kpr===true&&st>=shockEnd}
function respW(){return S.rr>0?Math.sin(6.2832*S.rr/60*st):0}
function ecg(){let v=ecgBase();if(ecgOn()&&st>=shockEnd&&!kprOn())v+=0.03*respW();
  if(kprOn()&&ecgOn()){kprStep();v=v*0.3+1.15*KC.amp*kprShape()+0.12*Math.sin(6.28*0.27*st)+0.06*Math.sin(6.28*0.11*st+1)}
  return v+((pFire()&&pLast>-5&&pc.ma>=20)?Math.min(.4,.1+pc.ma/250)*g(st,pLast,.008):0)}
/* zachycený stimulovaný úder (stimulace pravé komory): široký, ve II převážně negativní QRS a opačně orientovaná T vlna */
function pacedBeat(u){const ag=(x,m,a,b)=>g(x,m,x<m?a:b);return 0.18*g(u,0.19,0.018)-0.95*ag(u,0.255,0.032,0.05)+0.12*g(u,0.33,0.03)+0.38*ag(u,0.52,0.08,0.06)}
function ecgBase(){
  const r=S.rhythm;
  /* po výboji: krátký artefakt výboje, pak ~3 s pauza (izolinie se po přebuzení zesilovače vrací k nule) */
  if(st<shockEnd){const el=SHOCKP-(shockEnd-st);return el<0.15?(Math.random()-.5)*3:0.6*Math.exp(-(el-0.15)/0.7)+0.006*(Math.random()-.5)}
  if(S.ecgon===false)return 0;
  if(r==='asys'&&!pCap())return 0.01*Math.sin(st*3)+0.01*(Math.random()-.5);
  if(r==='vf')return 0.45*Math.sin(6.28*4.2*st)*(0.6+0.4*Math.sin(6.28*0.6*st))+0.3*Math.sin(6.28*6.9*st+1)+0.1*(Math.random()-.5);
  if(r==='vt'||r==='pvt'){const f=Math.max(S.hr,100)/60;const p=6.28*f*st;return 0.85*Math.sin(p)+0.3*Math.sin(2*p+0.6)}
  if(r==='tdp'){const f=Math.max(S.hr,150)/60;return 0.9*Math.sin(6.28*f*st+0.4*Math.sin(6.28*0.22*st))*(0.2+0.8*Math.abs(Math.sin(6.28*0.2*st)))}
  let v=0;
  /* AV blokáda III. st.: P vlny 80/min nezávisle na širokém komorovém náhradním rytmu (QRS ≥ 0,12 s, diskordantní T) */
  if(r==='av3'&&btype==='p'&&lastBeat>-5){const pp=st%0.75;return 0.13*(g(pp,0.12,0.022)+g(pp+0.75,0.12,0.022))+pacedBeat(st-lastBeat)}
  if(r==='av3'&&btype!=='p'){const pp=st%0.75;v=0.13*(g(pp,0.12,0.022)+g(pp+0.75,0.12,0.022));if(lastBeat>-5){const u=st-lastBeat,ag=(x,m,a,b)=>g(x,m,x<m?a:b);v+=-0.08*g(u,0.16,0.02)+0.95*ag(u,0.23,0.035,0.045)-0.42*g(u,0.33,0.045)-0.32*ag(u,0.62,0.09,0.07)}return v}
  /* Elevace ST – vyvíjející se infarkt: hluboké Q, menší R, zvednutý ST, negativní T */
  if(r==='ste'&&btype!=='p'){if(lastBeat<-5)return 0;const u=(st-lastBeat)/Math.min(1,rrBeat/0.8),sg=x=>1/(1+Math.exp(-x));
    return 0.12*g(u,0.10,0.025)-0.32*g(u,0.215,0.014)+0.6*g(u,0.255,0.012)+0.32*sg((u-0.285)/0.004)*sg(-(u-0.40)/0.03)+0.1*g(u,0.36,0.04)-0.3*g(u,0.50,0.055)}
  if(lastBeat>-5){
    const k=btype==='p'?1:Math.min(1,rrBeat/0.8),u=(st-lastBeat)/k;
    v=btype==='p'?pacedBeat(u):-0.10*g(u,0.215,0.009)+1.0*g(u,0.245,0.011)-0.22*g(u,0.275,0.011)+0.25*g(u,0.48,0.045);
    if(btype!=='p'&&(r==='sinus'||r==='tachy'||r==='brady'||r==='ste'||r==='pea'))v+=0.12*g(u,0.10,0.025);
  }
  if(r==='flutter')v+=((st*5)%1-0.5)*0.35;
  if(r==='af')v+=0.04*(Math.sin(6.28*7*st)+Math.sin(6.28*11.3*st+2))+0.015*(Math.random()-.5);
  return v;
}
function pleth(){
  /* při KPR oxymetr nenajde spolehlivý pulz – jen slabý nečitelný signál, stejně jako SpO2 --- */
  if(kprOn())return 0.03+0.02*Math.sin(6.28*1.3*st)+0.015*(Math.random()-.5);
  if(NOPULSE.includes(S.rhythm)&&!pCap())return 0.02;
  if(lastBeat<-5||S.spo2<=0)return 0.02;
  if(S.sys>0&&S.sys<60)return 0.03+0.02*Math.sin(6.28*1.3*st)+0.015*(Math.random()-.5); /* slabý signál – bez čitelné pulzové vlny */
  const tb=st-lastBeat;
  const perf=Math.max(0.12,Math.min(1,S.sys/110))*Math.max(0.35,Math.min(1,S.spo2/95));
  return perf*(1+0.07*respW())*(g(tb,0.28,0.07)+0.3*g(tb,0.48,0.09))+0.015*respW();
}
/* zástava bez KPR: nedýchá → plochý kapnogram; při KPR ventilace 10/min s nízkým EtCO2 */
function arrest(){return NOPULSE.includes(S.rhythm)&&!pCap()}
function co2Now(){if(S.kpr!==true&&arrest())return{rr:0,et:0};return{rr:S.rr,et:S.etco2}}
function capno(){
  const q=co2Now();if(q.rr<=0)return 0;
  const per=60/q.rr,ph=(st%per)/per;
  const a=q.et;
  if(ph<0.03)return a*(ph/0.03)*0.9;
  if(ph<0.40)return a*(0.9+0.1*((ph-0.03)/0.37));
  if(ph<0.43)return a*(1-(ph-0.40)/0.03);
  return 0;
}
let prev=performance.now();
function frame(now){
  if(mode!=='mon')return;
  let dt=Math.min(0.1,(now-prev)/1000);prev=now;
  const steps=Math.max(1,Math.round(dt/0.008)),h=dt/steps;
  for(let s=0;s<steps;s++){
    st+=h;sched();
    if(df.sync&&!pc.on&&rHit(h)){markAt=st;if(df.pend&&df.st==='rdy')dfFire()}
    const vals=[ecg(),pleth(),capno()];
    for(let i=0;i<3;i++){
      if((i===1&&S.spo2on===false)||(i===2&&S.co2on===false)){T[i].y=null;continue}
      const c=cv[i],W=c.clientWidth,H=c.clientHeight,t=T[i],ctx=cx[i];
      let y;
      if(i===0)y=H*0.58-vals[0]*H*0.33;
      else if(i===1)y=H*0.85-vals[1]*H*0.65;
      else y=H*0.88-(vals[2]/60)*H*0.75;
      const nx=t.x+SPEED[i]*(dev==='pc'?1.4:1)*h;
      ctx.strokeStyle=COL[i];ctx.beginPath();
      if(t.y===null)ctx.moveTo(t.x,y);else ctx.moveTo(t.x,t.y);
      ctx.lineTo(nx,y);if(!(i===0&&S.ecgon===false&&Math.floor(nx/10)%2))ctx.stroke();
      ctx.clearRect(nx+2,0,16,H);
      if(i===0&&markAt&&st>=markAt){markAt=0;ctx.fillStyle='#fff';ctx.fillRect(nx-1,22,3,10)}
      t.x=nx;t.y=y;
      if(t.x>W){t.x=0;t.y=null;ctx.clearRect(0,0,20,H)}
    }
  }
  if(beatFlag){beatFlag=0;if(hrShown){const h=$('heart');h.style.opacity=1;setTimeout(()=>{h.style.opacity=.25},130)}}
  requestAnimationFrame(frame);
}
let hrShown=false,spShown=false,AC=null,sndOn=true,alPrev=0,alSilence=0,alLevel=0,alN=0,markAt=0,shockEnd=0;
let nibp={on:false,t0:0,tgt:0,val:null};
let df={mode:true,st:'idle',j:200,sync:false,t0:0,b:0,pend:false,pendT:0,msgT:0};
/* čas příštího vrcholu R pro synchronizovanou kardioverzi; null = monitor nenajde QRS (VF, asystolie, torsades, KPR) */
const VTPK=(()=>{let b=0,bv=-9;for(let p=0;p<6.283;p+=.001){const v=.85*Math.sin(p)+.3*Math.sin(2*p+.6);if(v>bv){bv=v;b=p}}return b/6.2832})();
function nextR(){const r=S.rhythm;if(!ecgOn()||st<shockEnd||S.kpr===true||r==='vf'||r==='asys'||r==='tdp')return null;
  if(r==='vt'||r==='pvt'){const f=Math.max(S.hr,100)/60;return (Math.floor(st*f-VTPK)+1+VTPK)/f}
  if(lastBeat<-5||S.hr<=0&&btype!=='p')return null;const off=r==='av3'?.23:.245,t=lastBeat+off*(btype==='p'?1:Math.min(1,rrBeat/.8));
  return t>st?t:nextBeat+off*Math.min(1,60/Math.max(S.hr,1)/.8)}
/* nastal vrchol R právě v posledním kroku (st-h, st]? */
function rHit(h){const r=S.rhythm;if(!ecgOn()||st<shockEnd||S.kpr===true||r==='vf'||r==='asys'||r==='tdp')return false;
  let t;if(r==='vt'||r==='pvt'){const f=Math.max(S.hr,100)/60;t=(Math.floor(st*f-VTPK)+VTPK)/f}
  else{if(lastBeat<-5)return false;t=lastBeat+(r==='av3'?.23:.245)*(btype==='p'?1:Math.min(1,rrBeat/.8))}
  return t>st-h&&t<=st}
const EN=[2,3,4,5,6,7,8,9,10,15,20,30,50,70,100,125,150,175,200,225,250,275,300,325,360],CHG=4000;
let dfSnd=null,nibpSnd=null;
let pc={on:false,rate:70,ma:5,pz:0},pNext=0,pLast=-9,btype='n';const THR=70,CUR=[0,5,10,15,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200];
function ecgOn(){return S.ecgon!==false}
function ecgGuard(){if(ecgOn())return;if(df.st==='chg'||df.st==='rdy'){dfStopSnd();df.st='idle'}}
function pFire(){const r=S.rhythm;return pc.on&&ecgOn()&&Date.now()>=pc.pz&&r!=='vf'&&(r==='asys'||S.hr<pc.rate)}
function pCap(){return pFire()&&pc.ma>=THR&&S.rhythm!=='pea'&&S.rhythm!=='tdp'}
/* stimulace nejde zapnout při asystolii, při KPR ani při vypnutém EKG (bez EKG by nic nesnímala ani nedělala) */
function pBlocked(){return NOPULSE.includes(S.rhythm)||S.kpr===true||!ecgOn()}
function pPaint(){$('mdp').disabled=pBlocked();$('prv').textContent=pc.rate;$('pov').textContent=pc.ma;const pz=pc.pz-Date.now(),eo=ecgOn();$('pps').textContent=(eo&&pz>0)?'PAUZA '+Math.ceil(pz/1000)+' s':'PAUZA';$('pps').disabled=!eo||pz>0;paintNums()}
function pTick(){if(pc.pz){if(Date.now()>=pc.pz)pc.pz=0;pPaint()}}
function setMode(m){
  if(m==='p'&&pBlocked())return;
  if(m==='p'&&!pc.on)monEvent('Stimulace ZAP · '+pc.rate+'/min · '+pc.ma+' mA','pace');else if(m==='d'&&pc.on)monEvent('Stimulace VYP','pace');
  $('dfp').dataset.md=m;$('mdd').classList.toggle('on',m==='d');$('mdp').classList.toggle('on',m==='p');
  $('secd').classList.toggle('off',m!=='d');$('secp').classList.toggle('off',m!=='p');
  if(m==='d'){pc.on=false;pc.pz=0;pLast=-9}else{pc.on=true;pc.pz=0;pNext=st+.3;if(df.st==='chg'||df.st==='rdy'){dfStopSnd();df.st='idle'}}
  dfPaint();pPaint();
}
let VOL=2;try{const v=localStorage.getItem('simvol');if(v!==null&&+v>=0&&+v<=3)VOL=+v}catch(e){}
const VOLG=[0,.25,.6,1],VOLI=['🔇','🔈','🔉','🔊'];let MG=null;
function OUT(){if(!MG){MG=AC.createGain();MG.connect(AC.destination)}MG.gain.value=VOLG[VOL];return MG}
/* tón alarmu: plochý puls s krátkým náběhem a doběhem, se svrchní harmonickou (lépe slyšitelný) */
function apulse(f,d,v,at){if(!AC||!sndOn)return;try{const t=AC.currentTime+(at||0),g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.02);g.gain.setValueAtTime(v,t+d-.03);g.gain.linearRampToValueAtTime(0,t+d);g.connect(OUT());
  [[f,'triangle',1],[f*2,'sine',.35],[f*3,'sine',.15]].forEach(([fr,ty,a])=>{const o=AC.createOscillator(),og=AC.createGain();o.type=ty;o.frequency.value=fr;og.gain.value=a;o.connect(og);og.connect(g);o.start(t);o.stop(t+d+.02)})}catch(e){}}
function alarmSound(lv){if(lv===2)[0,.2,.4,.9,1.1].forEach(o=>apulse(880,.15,.28,o));else[0,.28,.56].forEach(o=>apulse(587,.2,.22,o))}
function audioInit(){try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();AC.resume()}catch(e){}}
function tone(f,d,v,type,at){
  if(!AC||!sndOn)return;
  try{const o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime+(at||0);
  o.type=type||'sine';o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v||.2,t+.005);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g);g.connect(OUT());o.start(t);o.stop(t+d+.02)}catch(e){}
}
function pulseBeep(){if(spShown)tone(Math.max(300,Math.min(1000,300+(S.spo2-70)*23)),.09,.18);else if(hrShown)tone(700,.09,.18)}
function alarmTick(){
  const rem=alSilence-Date.now();
  $('alsil').textContent=rem>0?'🔕 '+Math.ceil(rem/1000):'🔕';
  /* vysoká priorita (kritický rytmus): 3+2 tóny každé 4 s; střední priorita: 3 tóny každých 8 s */
  if(!alLevel||rem>0){alN=0;alPrev=0;return}
  if(alLevel!==alPrev){alN=0;alPrev=alLevel}
  if(alN%(alLevel===2?4:8)===0)alarmSound(alLevel);
  alN++;
}
function holdSound(type,f0,f1,d,v){
  if(!AC||!sndOn)return null;
  try{const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
  o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.linearRampToValueAtTime(f1,t+d);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.08);g.gain.setValueAtTime(v,t+d);g.gain.linearRampToValueAtTime(0,t+d+.1);
  let n=o;if(AC.createBiquadFilter){const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=600;o.connect(f);n=f}
  n.connect(g);g.connect(OUT());o.start(t);o.stop(t+d+.15);return {o,g}}catch(e){return null}
}
function stopSound(x){if(!x)return;try{const t=AC.currentTime;x.g.gain.cancelScheduledValues(t);x.g.gain.setTargetAtTime(.0001,t,.03);[].concat(x.o).forEach(o=>o.stop(t+.2))}catch(e){}}
function nibpStep(){
  if(!nibp.on)return;
  const el=(Date.now()-nibp.t0)/1000;
  if(el>8){const k=Math.floor((el-8)/1.4);if(k!==nibp.k){nibp.k=k;tone(1500,.03,.1,'square')}}
  if(el>=20){nibp.on=false;const j=()=>Math.round(Math.random()*4-2),ok=S.kpr!==true&&S.hr>0&&(!NOPULSE.includes(S.rhythm)||pCap());
    /* bez pulzu nebo při KPR manžeta nic nenaměří */
    nibp.val=ok?{sys:S.sys>0?Math.max(1,S.sys+j()):0,dia:S.dia>0?Math.max(1,S.dia+j()):0}:{sys:0,dia:0};monEvent(nibp.val.sys>0?'TK změřen '+nibp.val.sys+'/'+nibp.val.dia:'TK nenaměřen','info');bpTime=hhmm();[0,.18].forEach(o=>tone(880,.12,.18,'sine',o))}
  paintNums();
}
function dfStopSnd(){
  if(!dfSnd)return;
  try{const t=AC.currentTime;dfSnd.g.gain.cancelScheduledValues(t);dfSnd.g.gain.setTargetAtTime(.0001,t,.03);dfSnd.o.stop(t+.2)}catch(e){}
  dfSnd=null;
}
function dfChgSnd(d){
  dfStopSnd();if(!AC||!sndOn)return;
  try{const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
  o.type='triangle';o.frequency.setValueAtTime(280,t);o.frequency.exponentialRampToValueAtTime(2300,t+d);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.09,t+.12);g.gain.setValueAtTime(.09,t+d);g.gain.linearRampToValueAtTime(0,t+d+.05);
  o.connect(g);g.connect(OUT());o.start(t);o.stop(t+d+.1);dfSnd={o,g}}catch(e){}
}
function dfPaint(){
  $('dfj').textContent=df.j+' J';$('dfs').classList.toggle('on',df.sync);
  const pc=df.st==='chg'?Math.min(100,Math.round((Date.now()-df.t0)/CHG*100)):0;
  $('dfst').style.setProperty('--p',pc+'%');
  let t={idle:'',chg:pc+' %',rdy:df.pend?'ČEKÁ NA QRS':'PŘIPRAVEN',shk:'DODÁN'}[df.st];
  if(Date.now()-df.msgT<2500&&df.st==='rdy'&&!df.pend)t='QRS NENALEZEN';
  const dt=t;$('dfch').textContent=dt;$('dfst').classList.toggle('hide',!dt);$('dfp').dataset.st=df.st;
  const eo=ecgOn();$('dfx').disabled=df.st!=='rdy'||!eo;$('dfc').disabled=df.st==='shk'||(!eo&&df.st==='idle');
  $('dfc').textContent=(df.st==='chg'||df.st==='rdy')?'ZRUŠIT':'NABÍT';
  $('dfm').disabled=$('dfp2').disabled=df.st!=='idle';
}
function dfCharge(){if(!ecgOn())return;monEvent('Nabíjení '+df.j+' J'+(df.sync?' (SYNC)':''),'chg');df.st='chg';df.t0=Date.now();dfChgSnd(CHG/1000);dfPaint()}
function dfShock(){
  if(df.st!=='rdy'||!ecgOn()||df.pend)return;
  /* SYNC: výboj až na příštím komplexu QRS; když QRS není, výboj se nedodá */
  if(df.sync){if(nextR()===null){df.msgT=Date.now();dfPaint();return}df.pend=true;df.pendT=Date.now();dfPaint();return}
  dfFire();
}
function dfFire(){
  if(df.st!=='rdy'||!ecgOn())return;
  monEvent('VÝBOJ '+df.j+' J'+(df.sync?' (SYNC)':''),'shock');
  df.pend=false;df.sync=false;markAt=0;dfStopSnd();df.st='shk';df.t0=Date.now();shockEnd=st+SHOCKP;tone(110,.5,.5,'sawtooth');
  const f=$('flash');f.style.opacity=1;setTimeout(()=>{f.style.opacity=0},130);dfPaint();
}
function dfTick(){
  const n=Date.now()-df.t0;
  if(df.st==='chg'&&n>=CHG){df.st='rdy';df.t0=Date.now();df.b=-1}
  if(df.st==='rdy'){const k=Math.floor((Date.now()-df.t0)/600);if(k!==df.b){df.b=k;tone(1400,.28,.12)}}
  if(df.st==='shk'&&n>3500)df.st='idle';
  if(df.st==='shk'||shockEnd>st-1)paintNums(); /* rychlá aktualizace tepu během pauzy po výboji a po ní */
  if(df.pend&&(df.st!=='rdy'||!df.sync||Date.now()-df.pendT>3000)){df.pend=false;if(df.st==='rdy')df.msgT=Date.now()}
  dfPaint();
}
let LIM={...LIMDEF};
function hhmm(){return new Date().toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'})}
let bpTime=hhmm();
function tick(){$('clock').textContent=new Date().toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
/* přirozené kolísání zobrazených hodnot (alarmy počítají s nastavenou hodnotou) */
const VAR={hr:0,spo2:0,rr:0,etco2:0};
function varStep(){const af=S.rhythm==='af',w=(k,a,b)=>{VAR[k]=Math.max(-b,Math.min(b,VAR[k]+a*(Math.floor(Math.random()*3)-1)))};w('hr',af?3:1,af?8:2);w('spo2',1,1);w('rr',1,1);w('etco2',1,1)}
const vv=(k,b,mi,ma)=>b<=0?b:Math.max(mi,Math.min(ma,b+VAR[k]));
function paintNums(){
  const cap=pCap(),dead=(S.rhythm==='vf'||S.rhythm==='asys')&&!cap,hrv=cap?pc.rate:S.hr;
  const eOn=S.ecgon!==false,sOn=S.spo2on!==false,hOn=eOn||sOn,yOn=S.syson!==false,dOn=yOn;
  const hrOk=!dead&&hrv>0;
  const noecg=S.ecgon===false;
  const kp=S.kpr===true,hrd=cap?pc.rate:vv('hr',hrv,1,300);
  /* saturační čidlo: SpO2 a TF jdou vždy spolu – jen při hmatném pulzu (ne bez pulzu, ne při KPR) */
  const lowp=S.sys>0&&S.sys<60; /* velmi nízký tlak → oxymetr nenajde spolehlivý pulz */
  const pulse=sOn&&S.spo2>0&&hrOk&&!kp&&!lowp&&(!NOPULSE.includes(S.rhythm)||cap);
  const shp=st<shockEnd; /* pauza po výboji – monitor tep nezachytí */
  $('vHr').textContent=(!kp&&!shp&&S.rhythm!=='tdp'&&hOn&&hrOk&&(!noecg||pulse))?hrd:'---';
  $('nHr').style.setProperty('--c',noecg?'#3aa0ff':'#2ee66b');
  $('hrsrc').textContent=noecg?'':'EKG';
  $('vPr').textContent=pulse?hrd:'---';
  $('vSpo').textContent=pulse?vv('spo2',S.spo2,1,100):'---';
  hrShown=$('vHr').textContent!=='---';spShown=$('vSpo').textContent!=='---';
  const bv=nibp.val,sv=(!nibp.on&&bv&&yOn)?bv.sys:0;
  if(nibp.on){const el=(Date.now()-nibp.t0)/1000,p=el<8?nibp.tgt*el/8:nibp.tgt*(1-Math.min(12,Math.floor((el-8)/1.4)*1.4)/12);$('vBp').textContent=Math.max(0,Math.round(p));$('vMap').textContent='manžeta';$('vBpT').textContent=Math.max(0,Math.ceil(20-el))+' s'}
  else if(!bv||bv.sys<=0){$('vBp').textContent='---/---';$('vMap').textContent='(---)';$('vBpT').textContent=bv?bpTime:''}
  else{$('vBp').textContent=(yOn?bv.sys:'---')+'/'+(dOn?bv.dia:'---');$('vMap').textContent=(yOn&&dOn)?'('+Math.round((bv.sys+2*bv.dia)/3)+')':'(---)';$('vBpT').textContent=bpTime}
  $('nibpb').textContent=nibp.on?'Zrušit':'Změřit TK';
  const co=S.co2on!==false;
  const q=co2Now();$('vCo').textContent=(!co||q.rr<=0||q.et<=0)?'---':vv('etco2',q.et,1,99);
  $('vRr').textContent=(!co||q.rr<=0)?'---':vv('rr',q.rr,1,99);
  $('co2em').textContent=co?'0–60 mmHg':'VYPNUTO';
  $('nCo').style.opacity=co?1:.35;
  $('nHr').style.opacity=hOn?1:.35;$('nSpo').style.opacity=sOn?1:.35;$('nBp').style.opacity=(yOn||dOn)?1:.35;
  $('lHr').textContent=LIM.hr[1]+'\n'+LIM.hr[0];
  $('lSpo').textContent=LIM.spo2[1]+'\n'+LIM.spo2[0];
  $('lBp').textContent=LIM.sys[1]+'\n'+LIM.sys[0];
  $('lCo').textContent=LIM.etco2[1]+'\n'+LIM.etco2[0];
  const al=[];let crit=false;
  if(eOn&&S.rhythm==='asys'&&!cap){al.push('ASYSTOLIE');crit=true}
  else if(eOn&&S.rhythm==='vf'){al.push('FIBRILACE KOMOR');crit=true}
  else if(eOn&&(S.rhythm==='vt'||S.rhythm==='pvt'||S.rhythm==='tdp')){al.push('KOMOROVÁ TACHYKARDIE');crit=true}
  const f={
    nHr:!kp&&!shp&&hOn&&!dead&&(hrv<LIM.hr[0]||hrv>LIM.hr[1]),
    nSpo:sOn&&!kp&&(!pulse||S.spo2<LIM.spo2[0]),
    nBp:!dead&&sv>0&&(sv<LIM.sys[0]||sv>LIM.sys[1]),
    nCo:co&&!arrest()&&(q.rr<=0||q.et<LIM.etco2[0]||q.et>LIM.etco2[1])
  };
  if(f.nHr&&S.rhythm!=='vt'&&S.rhythm!=='pvt'&&S.rhythm!=='tdp')al.push(hrv<LIM.hr[0]?'HR NÍZKÁ':'HR VYSOKÁ');
  if(f.nSpo)al.push(pulse?'SpO₂ NÍZKÁ':lowp&&!NOPULSE.includes(S.rhythm)?'SpO₂ – SLABÝ SIGNÁL':'SpO₂ – BEZ PULZU');
  if(f.nBp)al.push(sv<LIM.sys[0]?'TK NÍZKÝ':'TK VYSOKÝ');
  if(f.nCo)al.push(q.rr<=0?'APNOE':q.et<LIM.etco2[0]?'EtCO₂ NÍZKÝ':'EtCO₂ VYSOKÝ');
  for(const k in f)$(k).classList.toggle('al',f[k]);
  const a=$('alm');a.textContent=al.length?al.join(' · '):'\u00a0';
  a.className=al.length?(crit?'on':'on w'):'';
  alLevel=al.length?(crit?2:1):0;
}
function handleState(d){
  if(!d||typeof d!=='object'||!RHY[d.rhythm])return;
  const n={...S};
  for(const [k,,mi,ma] of FIELDS){const v=Number(d[k]);if(isFinite(v))n[k]=Math.max(mi,Math.min(ma,v))}
  n.rhythm=d.rhythm;
  ['ecgon','hron','spo2on','syson','co2on'].forEach(k=>{n[k]=d[k]!==false});
  n.syson=true; /* tlak nejde vypnout – do prvního změření je ---/--- */
  n.kpr=d.kpr===true&&NOPULSE.includes(n.rhythm);hrClamp(n);bpFix(n,'sys');
  if(d.lim&&typeof d.lim==='object'){const L={...LIM};for(const k in LIMR){const v=d.lim[k],mi=LIMR[k][2],ma=LIMR[k][3];if(Array.isArray(v)&&v.length===2){const lo=Math.max(mi,Math.min(ma,Number(v[0]))),hi=Math.max(mi,Math.min(ma,Number(v[1])));if(isFinite(lo)&&isFinite(hi)&&lo<hi)L[k]=[lo,hi]}}LIM=L;n.lim=L}
  [['ecgon',0],['spo2on',1],['co2on',2]].forEach(([k,i])=>{if(n[k]!==(S[k]!==false)){T[i].x=0;T[i].y=null;cx[i].clearRect(0,0,1e5,1e5)}});
  if(n.sys!==S.sys||n.dia!==S.dia)bpTime=hhmm();
  const changed=n.rhythm!==S.rhythm||n.hr!==S.hr;
  S=n;lastRx=Date.now();
  $('wait').classList.add('hide');$('stale').classList.add('hide');
  if(pc.on&&pBlocked())setMode('d');
  ecgGuard();dfPaint();pPaint();
  if(changed){nextBeat=st}
  paintNums();
}
/* monitor posílá ovladači, co právě zobrazuje (pro náhled v ovladači) */
let monConn=()=>null,pcT=0;
function monEvent(text,kind){const c=monConn();if(c&&c.open){try{c.send({ev:{text,kind,t:Date.now()}})}catch(e){}}}
function monSnap(){const t=id=>$(id).textContent.trim();return{hr:t('vHr'),spo2:t('vSpo'),bp:t('vBp'),co2:t('vCo'),alm:t('alm'),crit:$('alm').className==='on',df:{st:df.st,j:df.j,sync:df.sync,pend:df.pend},pc:{on:pc.on,rate:pc.rate,ma:pc.ma}}}
function startMon(){
  if(!getCode())return;
  if(typeof Peer==='undefined'&&typeof firebase==='undefined'){fail('Nepodařilo se načíst službu pro spojení. Zkontroluj připojení k internetu.');return}
  mode='mon';$('mon').classList.toggle('pc',dev==='pc');
  const devPaint=()=>{const b=$('devb');b.textContent=dev==='pc'?'🖥':'📱';b.title=dev==='pc'?'Zobrazení pro PC – přepnout na telefon':'Zobrazení pro telefon – přepnout na PC';b.setAttribute('aria-label',b.title)};devPaint();
  $('devb').onclick=()=>{dev=dev==='pc'?'phone':'pc';try{localStorage.setItem('simdev',dev)}catch(e){}$('mon').classList.toggle('pc',dev==='pc');devPaint();requestAnimationFrame(orient)};$('fs').classList.toggle('hide',!document.documentElement.requestFullscreen);
  $('fs').onclick=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen()}else{await document.documentElement.requestFullscreen();try{await screen.orientation.lock('landscape')}catch(e){}}}catch(e){}};
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement){try{screen.orientation.unlock()}catch(e){}}});
  show('mon');$('wcode').textContent=code;tick();setInterval(tick,1000);orient();paintNums();
  /* telefon: zkusit celou obrazovku a zamknout na šířku (Android); jinak zůstane otočení přes CSS */
  if(dev!=='pc'){try{const de=document.documentElement,rq=de.requestFullscreen||de.webkitRequestFullscreen;if(rq)Promise.resolve(rq.call(de)).then(()=>screen.orientation&&screen.orientation.lock('landscape')).catch(()=>{}).finally(()=>setTimeout(orient,300))}catch(e){}}
  const wake=()=>{try{if(navigator.wakeLock&&document.visibilityState==='visible')navigator.wakeLock.request('screen').catch(()=>{})}catch(e){}};wake();
  /* prohlížeč zámek obrazovky i zvuk při přepnutí aplikace uvolní – po návratu obnovit */
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){wake();try{AC&&AC.resume()}catch(e){}}});
  document.addEventListener('pointerdown',()=>{try{AC&&AC.state!=='running'&&AC.resume()}catch(e){}});
  audioInit();
  const volPaint=()=>{const b=$('snd');b.textContent=VOLI[VOL];b.title='Hlasitost: '+['vypnuto','tiše','středně','nahlas'][VOL]+' (klepnutím změníš)';b.setAttribute('aria-label',b.title)};
  sndOn=VOL>0;volPaint();
  $('snd').onclick=()=>{VOL=(VOL+1)%4;sndOn=VOL>0;try{localStorage.setItem('simvol',VOL)}catch(e){}volPaint();if(MG)MG.gain.value=VOLG[VOL];if(sndOn){audioInit();OUT();tone(880,.08,.18)}};
  $('alsil').onclick=()=>{alSilence=alSilence>Date.now()?0:Date.now()+120000;monEvent(alSilence?'Alarmy ztlumeny na 2 min':'Ztlumení alarmů zrušeno','info')};
  $('nibpb').onclick=()=>{if(nibp.on){nibp.on=false;stopSound(nibpSnd);nibpSnd=null;monEvent('Měření TK zrušeno','info')}else{monEvent('Měření TK…','info');nibp={on:true,t0:Date.now(),tgt:Math.max(120,S.sys+30),val:nibp.val,k:-1};nibpSnd=holdSound('sawtooth',70,130,8,.05)}paintNums()};
  $('dfm').onclick=()=>{df.j=EN[Math.max(0,EN.indexOf(df.j)-1)];dfPaint()};
  $('dfp2').onclick=()=>{df.j=EN[Math.min(EN.length-1,EN.indexOf(df.j)+1)];dfPaint()};
  $('dfs').onclick=()=>{df.sync=!df.sync;dfPaint()};
  $('dfc').onclick=()=>{if(df.st==='chg'||df.st==='rdy'){dfStopSnd();df.st='idle';monEvent('Nabití zrušeno','info');dfPaint()}else dfCharge()};
  $('dfx').onclick=dfShock;
  $('mdd').onclick=()=>setMode('d');$('mdp').onclick=()=>setMode('p');
  $('prm').onclick=()=>{pc.rate=Math.max(40,pc.rate-5);pPaint()};$('prp').onclick=()=>{pc.rate=Math.min(170,pc.rate+5);pPaint()};
  $('pom').onclick=()=>{pc.ma=CUR[Math.max(0,CUR.indexOf(pc.ma)-1)];pPaint()};$('pop').onclick=()=>{pc.ma=CUR[Math.min(CUR.length-1,CUR.indexOf(pc.ma)+1)];pPaint()};
  $('pps').onclick=()=>{if(!pc.on||!ecgOn())return;pc.pz=Date.now()+5000;pLast=-9;monEvent('Stimulace PAUZA 5 s','pace');pPaint()};
  ['prm','prp','pom','pop'].forEach(id=>$(id).addEventListener('click',()=>{clearTimeout(pcT);pcT=setTimeout(()=>{if(pc.on)monEvent('Stimulace '+pc.rate+'/min · '+pc.ma+' mA','pace')},900)}));
  setInterval(()=>{nibpStep();dfTick();pTick()},250);setInterval(alarmTick,1000);setInterval(()=>{varStep();paintNums()},2000);dfPaint();
  setInterval(()=>{if(lastRx&&Date.now()-lastRx>7000)$('stale').classList.remove('hide')},1000);
  setInterval(()=>{const c=monConn();if(c&&c.open){try{c.send({mon:monSnap()})}catch(e){}}},1000);
  prev=performance.now();requestAnimationFrame(frame);
  /* spojení: nejdřív Firebase, když nejde, záloha PeerJS */
  fbInit().then(f=>{
    const room=f.db.ref('rooms/'+code),me=room.child('mon/'+f.uid);let evn=0;
    room.child('state').on('value',sn=>{const v=sn.val();if(v)handleState(v)});
    me.onDisconnect().remove();
    monConn=()=>({open:true,send(d){if(d.mon)me.update({snap:d.mon,t:fbTS()}).catch(()=>{});if(d.ev)me.update({ev:{...d.ev,n:++evn},t:fbTS()}).catch(()=>{})}});
    $('relink').onclick=()=>{const b=$('stale');b.classList.add('busy');$('relink').textContent='Připojuji…';setTimeout(()=>{b.classList.remove('busy');$('relink').textContent='Připojit znovu'},4000);try{f.db.goOffline();f.db.goOnline()}catch(e){}};
  }).catch(()=>{if(typeof Peer!=='undefined')monPeer()});
}
function monPeer(){
  const p=new Peer();let conn=null,retry=0;
  const again=()=>{if(!retry)retry=setTimeout(()=>{retry=0;link()},3000)};
  /* ruční obnovení spojení z monitoru */
  $('relink').onclick=()=>{const b=$('stale');b.classList.add('busy');$('relink').textContent='Připojuji…';setTimeout(()=>{b.classList.remove('busy');$('relink').textContent='Připojit znovu'},4000);
    try{if(p.disconnected&&!p.destroyed)p.reconnect();else link()}catch(e){link()}};
  function link(){
    clearTimeout(retry);retry=0;
    const old=conn;conn=null;if(old){try{old.close()}catch(e){}}
    if(p.destroyed||p.disconnected)return;
    const c=p.connect('ecgsim-'+code,{reliable:true});conn=c;
    c.on('data',d=>{if(c===conn)handleState(d)});monConn=()=>conn;
    c.on('close',()=>{if(c===conn)again()});
    c.on('error',()=>{if(c===conn)again()});
  }
  p.on('open',link);
  p.on('error',e=>{if(e.type==='peer-unavailable'||e.type==='network'||e.type==='server-error')again()});
  p.on('disconnected',()=>{try{p.reconnect()}catch(e){}});
}
try{if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{})}catch(e){}
