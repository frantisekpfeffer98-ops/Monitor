// Testy spojení přes Firebase proti lokálnímu emulátoru (auth + database).
// Spouštějí se jen když je nastavené FB_EMU (např. FB_EMU=127.0.0.1), jinak se přeskočí.
const test=require('node:test');const assert=require('node:assert/strict');
const {chromium}=require('playwright');const path=require('path');
const EMU=process.env.FB_EMU;
const APP=process.env.APP_PATH||'index.html';
const URL='file://'+path.resolve(__dirname,'..',APP)+'?emu='+EMU;
let b;const opts={skip:!EMU&&'nastav FB_EMU (lokální emulátor Firebase)'};
test.before(async()=>{if(EMU)b=await chromium.launch()});
test.after(async()=>{if(b)await b.close()});
const stranka=async(vp)=>{const ctx=await b.newContext({viewport:vp});await ctx.route('**/peerjs.min.js',r=>r.abort());const p=await ctx.newPage();await p.goto(URL);return p};
const kod=()=>String(100000+Math.floor(Math.random()*900000));

test('ovladač a monitor si předávají stav, náhled a výboj přes Firebase',opts,async()=>{
  const k=kod();
  const c=await stranka({width:390,height:844});await c.fill('#code',k);await c.click('#bCtl');
  await c.waitForFunction(()=>mode==='ctl'&&!!fbCtl,null,{timeout:20000});
  const m=await stranka({width:844,height:390});await m.fill('#code',k);await m.click('#bMon');await m.evaluate(()=>{sndOn=false});
  await c.click('#ecgbtn');await c.click('#tg_spo2');await c.click('#upd');
  await m.waitForFunction(()=>S.ecgon===true&&$('vHr').textContent!=='---',null,{timeout:15000});
  await c.waitForFunction(()=>$('cst').textContent==='Připojeno'&&$('mHr').textContent!=='---',null,{timeout:15000});
  await c.click('#rhy-chips button[data-k=vf]');await c.click('#upd');
  await m.waitForFunction(()=>$('alm').textContent.includes('FIBRILACE KOMOR'),null,{timeout:10000});
  await m.evaluate(()=>{df.st='rdy';dfShock()});
  await c.waitForFunction(()=>$('mdev').textContent.includes('VÝBOJ'),null,{timeout:10000});
});

test('druhý ovladač se stejným kódem je odmítnut',opts,async()=>{
  const k=kod();
  const c=await stranka();await c.fill('#code',k);await c.click('#bCtl');await c.waitForFunction(()=>!!fbCtl,null,{timeout:20000});
  const c2=await stranka();await c2.fill('#code',k);await c2.click('#bCtl');
  await c2.waitForFunction(()=>$('noroom').textContent.includes('používá'),null,{timeout:20000});
  assert.equal(await c2.evaluate(()=>mode),'');
});

test('pravidla databáze: cizí uživatel nemůže měnit stav ani převzít místnost',opts,async()=>{
  const k=kod();
  const own=await stranka();await own.evaluate(async k=>{await fbInit();code=k;await fbCtlStart();send()},k);
  const atk=await stranka();await atk.evaluate(()=>fbInit());
  const zkus=(cesta,hodnota)=>atk.evaluate(async([c,v])=>{try{await FB.db.ref(c).set(v);return 'povoleno'}catch(e){return 'zamítnuto'}},[cesta,hodnota]);
  assert.equal(await zkus(`rooms/${k}/state`,{rhythm:'vf'}),'zamítnuto','zápis stavu');
  assert.equal(await zkus(`rooms/${k}/owner`,'x'),'zamítnuto','převzetí');
  assert.equal(await zkus(`rooms/${k}`,null),'zamítnuto','smazání');
  assert.equal(await zkus(`rooms/${k}/mon/nekdojiny`,{t:1}),'zamítnuto','cizí monitor');
  assert.equal(await zkus('rooms/abc',{owner:'x',t:1}),'zamítnuto','neplatný kód');
  assert.equal(await zkus('jinde',{x:1}),'zamítnuto','mimo místnosti');
  assert.equal(await atk.evaluate(()=>FB.db.ref('rooms').once('value').then(()=>'povoleno',()=>'zamítnuto')),'zamítnuto','výpis místností');
});
