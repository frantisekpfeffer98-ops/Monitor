// Testy rytmu SVT a jeho ukončení (vagový manévr / adenosin).
const testRaw=require('node:test');const assert=require('node:assert/strict');
const {ovladac,monitor,stav,text,rytmus,posun,S,zavri,APP}=require('./pomocnik');
const fs=require('fs'),path=require('path');
// verze aplikace bez SVT (např. starší ostrá verze) se přeskočí
const maSVT=fs.readFileSync(path.resolve(__dirname,'..',path.dirname(APP),'app.js'),'utf8').includes("svt:['SVT'");
const test=(n,f)=>testRaw(n,{skip:!maSVT&&'verze bez SVT'},f);
test.after=testRaw.after;
testRaw.after(zavri);

test('SVT: tep 150–250, karta Ukončení SVT jen u SVT',async()=>{
  const p=await ovladac({senzory:true});
  assert.equal(await p.evaluate(()=>$('svtc').classList.contains('hide')),true,'u sinusu skrytá');
  await rytmus(p,'svt');assert.equal((await S(p)).hr,180);
  await posun(p,'hr',100);assert.equal((await S(p)).hr,150);
  assert.equal(await p.evaluate(()=>$('svtc').classList.contains('hide')),false,'u SVT viditelná');
  assert.equal(await p.evaluate(()=>$('kprb').disabled),true,'KPR u SVT nejde');
});

test('SVT: tlačítko Adenosin přepne na sinus a odešle hned',async()=>{
  const p=await ovladac({senzory:true});await rytmus(p,'svt');await p.click('#upd');
  await p.click('#svta');
  const c=await p.evaluate(()=>C);assert.equal(c.rhythm,'sinus');assert.equal(c.term.kind,'adeno');
  assert.ok(await p.evaluate(()=>__odeslano.some(x=>x.term&&x.term.kind==='adeno')),'odesláno bez UPDATE');
});

test('SVT na monitoru: pravidelné intervaly, tep, SYNC výboj na QRS',async()=>{
  const p=await monitor();await stav(p,{rhythm:'svt',hr:200});await p.waitForTimeout(1500);
  assert.equal(await text(p,'vHr'),'200');assert.equal(await p.evaluate(()=>rrBeat.toFixed(3)),(60/200).toFixed(3));
  await p.evaluate(()=>{df.sync=true;df.st='rdy';window.__R=null;const f=dfFire;dfFire=function(){window.__R=Math.abs(st-(lastBeat+0.045));return f()};dfShock()});
  await p.waitForTimeout(1500);
  assert.equal(await p.evaluate(()=>df.st),'shk');
  const o=await p.evaluate(()=>__R);assert.ok(o!==null&&o<0.03,'výboj do 30 ms od vrcholu QRS, odchylka '+o);
});

test('ukončení SVT adenosinem: pauza ~4 s s tepem ---, pak sinus; náhled hlásí ukončení',async()=>{
  const p=await monitor();await stav(p,{rhythm:'svt',hr:180});await p.waitForTimeout(1000);
  await stav(p,{rhythm:'sinus',hr:80,term:{kind:'adeno',id:1}});
  await p.waitForTimeout(600);
  assert.equal(await text(p,'vHr'),'---','během pauzy');
  assert.equal(await p.evaluate(()=>monSnap().term),true,'náhled: probíhá ukončení');
  assert.ok((await p.evaluate(()=>__udalosti)).some(t=>t.includes('adenosin')));
  await p.waitForTimeout(2600);assert.equal(await text(p,'vHr'),'---','3,2 s po ukončení');
  await p.waitForTimeout(1200);assert.notEqual(await text(p,'vHr'),'---','po pauze je tep');
  // stejné id se už nezopakuje
  await stav(p,{rhythm:'svt',hr:180});await p.waitForTimeout(500);await stav(p,{rhythm:'sinus',hr:80,term:{kind:'adeno',id:1}});
  await p.waitForTimeout(300);assert.notEqual(await text(p,'vHr'),'---','staré ukončení se neopakuje');
});

test('vagový manévr: kratší pauza ~2 s',async()=>{
  const p=await monitor();await stav(p,{rhythm:'svt',hr:180});await p.waitForTimeout(800);
  await stav(p,{rhythm:'sinus',hr:80,term:{kind:'vagal',id:2}});await p.waitForTimeout(800);
  assert.equal(await text(p,'vHr'),'---');
  await p.waitForTimeout(1800);assert.notEqual(await text(p,'vHr'),'---');
});
