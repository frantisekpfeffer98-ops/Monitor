// Testy monitoru (studenti).
const test=require('node:test');const assert=require('node:assert/strict');
const {monitor,stav,text,alarm,zavri}=require('./pomocnik');
test.after(zavri);

test('SpO2 a TF jdou vždy spolu',async()=>{
  const p=await monitor();
  await stav(p,{rhythm:'sinus',hr:80,spo2:97});assert.equal(await text(p,'vSpo'),'97');assert.equal(await text(p,'vPr'),'80');
  await stav(p,{rhythm:'sinus',hr:80,spo2on:false});assert.equal(await text(p,'vSpo'),'---');assert.equal(await text(p,'vPr'),'---');
  assert.deepEqual(p.chyby,[]);
});

test('rytmy bez pulzu: SpO2 ---, alarm BEZ PULZU a kritický alarm rytmu',async()=>{
  const p=await monitor();
  for(const [r,o,al] of [['vf',{hr:0},'FIBRILACE KOMOR'],['asys',{hr:0},'ASYSTOLIE'],['pvt',{hr:190},'KOMOROVÁ TACHYKARDIE'],['tdp',{hr:220},'KOMOROVÁ TACHYKARDIE'],['pea',{hr:60},'']]){
    await stav(p,{rhythm:r,sys:0,dia:0,...o});
    assert.equal(await text(p,'vSpo'),'---',r);const a=await alarm(p);
    assert.ok(a.includes('SpO₂ – BEZ PULZU'),r+': '+a);if(al)assert.ok(a.includes(al),r+': '+a);
  }
  await stav(p,{rhythm:'tdp',hr:220,sys:0,dia:0});assert.equal(await text(p,'vHr'),'---','u torsades se tep neukazuje');
});

test('zástava bez KPR: plochý kapnogram, s KPR EtCO2 z ovladače',async()=>{
  const p=await monitor();
  await stav(p,{rhythm:'vf',hr:0,sys:0,dia:0,etco2:30});assert.equal(await text(p,'vCo'),'---');assert.equal(await text(p,'vRr'),'---');
  await stav(p,{rhythm:'vf',hr:0,sys:0,dia:0,kpr:true,etco2:12,rr:10});assert.equal(await text(p,'vCo'),'12');
  assert.equal(await text(p,'vHr'),'---','při KPR se tep neukazuje');
});

test('dechová frekvence 0: EtCO2 --- a alarm APNOE',async()=>{
  const p=await monitor();await stav(p,{rhythm:'sinus',hr:80,rr:0});
  assert.equal(await text(p,'vCo'),'---');assert.ok((await alarm(p)).includes('APNOE'));
});

test('nízký tlak: slabý signál SpO2',async()=>{
  const p=await monitor();await stav(p,{rhythm:'sinus',hr:80,sys:50,dia:30});
  assert.equal(await text(p,'vSpo'),'---');assert.ok((await alarm(p)).includes('SLABÝ SIGNÁL'));
});

test('stimulace nejde zapnout bez pulzu, při KPR ani bez EKG',async()=>{
  const p=await monitor();
  for(const s of [{rhythm:'vf',hr:0},{rhythm:'pea',hr:60},{rhythm:'asys',hr:0},{rhythm:'pvt',hr:190},{rhythm:'vf',hr:0,kpr:true},{rhythm:'brady',hr:40,ecgon:false}]){
    await stav(p,{sys:0,dia:0,...s});assert.equal(await p.evaluate(()=>$('mdp').disabled),true,JSON.stringify(s));
  }
  await stav(p,{rhythm:'brady',hr:40});assert.equal(await p.evaluate(()=>$('mdp').disabled),false);
});

test('AV blokáda: stimulace zachytí od 70 mA a tep = frekvence stimulace',async()=>{
  const p=await monitor();await stav(p,{rhythm:'av3',hr:35,sys:85,dia:50});
  await p.click('#mdp');await p.evaluate(()=>{pc.ma=60;pc.rate=70;pPaint()});await p.waitForTimeout(1500);
  assert.equal(await text(p,'vHr'),'35','pod prahem nezachytí');
  await p.evaluate(()=>{pc.ma=80;pPaint()});await p.waitForTimeout(2000);
  assert.equal(await text(p,'vHr'),'70');
});

test('SYNC: výboj přijde na QRS, u VF se nedodá a po výboji se SYNC vypne',async()=>{
  const p=await monitor();
  await stav(p,{rhythm:'vf',hr:0,sys:0,dia:0});await p.waitForTimeout(800);
  await p.evaluate(()=>{df.sync=true;df.st='rdy';dfShock()});await p.waitForTimeout(300);
  assert.equal(await p.evaluate(()=>df.st),'rdy','u VF se synchronizovaný výboj nedodá');
  assert.equal(await text(p,'dfch'),'QRS NENALEZEN');
  await stav(p,{rhythm:'af',hr:120});await p.waitForTimeout(1500);
  await p.evaluate(()=>{df.sync=true;df.st='rdy';window.__R=null;const f=dfFire;dfFire=function(){window.__R=Math.abs(st-(lastBeat+0.245*Math.min(1,rrBeat/.8)));return f()};dfShock()});
  await p.waitForTimeout(2500);
  assert.equal(await p.evaluate(()=>df.st),'shk','výboj byl dodán');
  const odchylka=await p.evaluate(()=>__R);assert.ok(odchylka!==null&&odchylka<0.03,'výboj do 30 ms od vrcholu QRS, odchylka '+odchylka);
  assert.equal(await p.evaluate(()=>df.sync),false,'SYNC se po výboji vypne');
  assert.ok((await p.evaluate(()=>__udalosti)).some(t=>t.startsWith('VÝBOJ')),'ovladač dostane událost výboje');
});

test('pauza po výboji: tep se asi 3 s neukazuje',async()=>{
  const p=await monitor();await stav(p,{rhythm:'sinus',hr:80});await p.waitForTimeout(1200);
  await p.evaluate(()=>{df.st='rdy';dfShock()});await p.waitForTimeout(800);
  assert.equal(await text(p,'vHr'),'---','0,8 s po výboji');
  await p.waitForTimeout(1900);assert.equal(await text(p,'vHr'),'---','2,7 s po výboji');
  await p.waitForTimeout(1700);assert.notEqual(await text(p,'vHr'),'---','4,4 s po výboji už je tep');
});

test('NIBP: do měření ---, bez pulzu nenaměří',async()=>{
  const p=await monitor();await stav(p,{rhythm:'sinus',hr:80,sys:120,dia:80});
  assert.equal(await text(p,'vBp'),'---/---');
  const zmer=async()=>{await p.evaluate(()=>{nibp={on:true,t0:Date.now()-19900,tgt:150,val:null,k:-1}});await p.waitForTimeout(500);return text(p,'vBp')};
  assert.match(await zmer(),/^1\d\d\/\d\d$/);
  await stav(p,{rhythm:'pea',hr:60,sys:0,dia:0});assert.equal(await zmer(),'---/---');
});
