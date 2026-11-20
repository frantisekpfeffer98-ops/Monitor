// Testy ovladače (lektor).
const test=require('node:test');const assert=require('node:assert/strict');
const {ovladac,rytmus,posun,S,zavri}=require('./pomocnik');
test.after(zavri);

test('po spuštění jsou senzory vypnuté a rytmy zamčené',async()=>{
  const p=await ovladac();const s=await S(p);
  assert.equal(s.ecgon,false);assert.equal(s.spo2on,false);assert.equal(s.co2on,false);assert.equal(s.kpr,false);
  assert.equal(await p.evaluate(()=>[...document.querySelectorAll('#rhy-chips button')].every(b=>b.disabled)),true);
  assert.deepEqual(p.chyby,[]);
});

test('kód pro spárování má 6 číslic a kratší se nepřijme',async()=>{
  const {stranka}=require('./pomocnik');const p=await stranka();
  assert.match(await p.inputValue('#code'),/^\d{6}$/);
  await p.fill('#code','1234');await p.click('#bCtl');
  assert.equal(await p.evaluate(()=>mode),'');
  assert.equal(await p.evaluate(()=>$('codehint').classList.contains('err')),true);
});

test('tep je omezen rozsahem rytmu',async()=>{
  const p=await ovladac({senzory:true});
  await posun(p,'hr',250);assert.equal((await S(p)).hr,100,'sinus max 100');
  await rytmus(p,'brady');await posun(p,'hr',150);assert.equal((await S(p)).hr,59,'bradykardie max 59');
  await rytmus(p,'tachy');await posun(p,'hr',60);assert.equal((await S(p)).hr,101,'tachykardie min 101');
});

test('systolický tlak je aspoň o 20 vyšší než diastolický',async()=>{
  const p=await ovladac({senzory:true});
  await posun(p,'dia',110);let s=await S(p);assert.ok(s.sys-s.dia>=20,`${s.sys}/${s.dia}`);
  await posun(p,'sys',70);s=await S(p);assert.ok(s.sys-s.dia>=20,`${s.sys}/${s.dia}`);
});

test('SpO2 jde nastavit jen 50–100',async()=>{
  const p=await ovladac({senzory:true});await posun(p,'spo2',10);assert.equal((await S(p)).spo2,50);
});

test('rytmy bez pulzu zamknou SpO2 a tlak, VF i tep; návrat obnoví tlak',async()=>{
  const p=await ovladac({senzory:true});
  await rytmus(p,'vf');
  const z=await p.evaluate(()=>['hr','spo2','sys','dia'].map(k=>$('s_'+k).disabled));
  assert.deepEqual(z,[true,true,true,true]);
  let s=await S(p);assert.equal(s.sys,0);assert.equal(s.dia,0);
  await rytmus(p,'pea');assert.equal(await p.evaluate(()=>$('s_hr').disabled),false,'u PEA jde tep měnit');
  await rytmus(p,'sinus');s=await S(p);assert.equal(s.sys,120);assert.equal(s.dia,80);
});

test('KPR jde zapnout jen u rytmů bez pulzu a nastaví DF 10 a EtCO2 10',async()=>{
  const p=await ovladac({senzory:true});
  assert.equal(await p.evaluate(()=>$('kprb').disabled),true);
  for(const r of ['vf','pvt','asys','pea','tdp']){await rytmus(p,r);assert.equal(await p.evaluate(()=>$('kprb').disabled),false,r)}
  await rytmus(p,'vf');await p.click('#kprb');let s=await S(p);
  assert.equal(s.kpr,true);assert.equal(s.rr,10);assert.equal(s.etco2,10);
  assert.equal(await p.evaluate(()=>$('s_etco2').disabled),false,'EtCO2 jde při KPR měnit');
  await rytmus(p,'sinus');assert.equal((await S(p)).kpr,false,'rytmus s pulzem KPR vypne');
});

test('vypnutou hodnotu nejde měnit posuvníkem ani tlačítky',async()=>{
  const p=await ovladac();const pred=(await S(p)).spo2;
  await p.locator('#s_spo2').locator('xpath=..').locator('button').first().click({force:true});
  assert.equal((await S(p)).spo2,pred);
  assert.equal(await p.evaluate(()=>$('s_spo2').disabled),true);
});

test('změny se odešlou až tlačítkem UPDATE, s volbou Odesílat ihned hned',async()=>{
  const p=await ovladac({senzory:true});
  const pocet=()=>p.evaluate(()=>__odeslano.filter(x=>x.ecgon).length);
  const pred=await pocet();assert.equal(pred,0,'bez UPDATE se nic neposílá');
  await p.click('#upd');await p.evaluate(()=>send());assert.ok(await pocet()>0);
  await p.click('#autob');await rytmus(p,'af');await p.waitForTimeout(300);
  assert.equal(await p.evaluate(()=>C.rhythm),'af');
});

test('uložené nastavení se obnoví, senzory ale startují vypnuté',async()=>{
  const p=await ovladac({senzory:true});await rytmus(p,'af');await p.click('#upd');
  await p.reload();await p.fill('#code','482915');await p.click('#bCtl');await p.waitForTimeout(60);
  const s=await S(p);assert.equal(s.rhythm,'af');assert.equal(s.ecgon,false);assert.equal(s.spo2on,false);
});

test('v menu alarmů nejde nastavit min nad max',async()=>{
  const p=await ovladac();await p.click('#calm');
  for(let i=0;i<30;i++)await p.click('#lim_spo2_0 + button');
  const [lo,hi]=await p.evaluate(()=>S.lim.spo2);assert.ok(lo<hi,`${lo} < ${hi}`);
});
