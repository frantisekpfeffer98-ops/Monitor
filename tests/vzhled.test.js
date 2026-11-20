// Testy rozložení obrazovek na různých displejích.
const test=require('node:test');const assert=require('node:assert/strict');
const {stranka,ovladac,monitor,zavri}=require('./pomocnik');
test.after(zavri);

test('úvodní obrazovka: karty Ovladač a Monitor vedle sebe i na malém telefonu',async()=>{
  const p=await stranka({width:320,height:640});
  const [a,b]=await p.evaluate(()=>['bCtl','bMon'].map(i=>$(i).getBoundingClientRect().top));
  assert.equal(Math.round(a),Math.round(b));
});

for(const w of [320,360,390,412]){
  test(`tlačítko UPDATE je na jednom řádku (${w} px)`,async()=>{
    const p=await ovladac({viewport:{width:w,height:800}});await p.click('#ecgbtn');
    const r=await p.evaluate(()=>{const u=$('upd');return {pret:u.scrollWidth>u.clientWidth,h:u.getBoundingClientRect().height,lh:parseFloat(getComputedStyle(u).fontSize)}});
    assert.equal(r.pret,false,'text přetéká');assert.ok(r.h<r.lh*2+34,'text je na víc řádcích');
  });
}

test('monitor na telefonu drženém na výšku je otočený na šířku',async()=>{
  const p=await monitor({viewport:{width:390,height:844}});
  const r=await p.evaluate(()=>({rot:$('mon').classList.contains('rot'),w:$('mon').offsetWidth,h:$('mon').offsetHeight}));
  assert.equal(r.rot,true);assert.ok(r.w>r.h);
});

test('horní lišta ovladače se vejde i na malý telefon',async()=>{
  const p=await ovladac({viewport:{width:320,height:640}});
  const pret=await p.evaluate(()=>{const b=document.querySelector('#ctl .bar');return [...b.querySelectorAll('button,.code')].some(e=>e.getBoundingClientRect().right>innerWidth+1)});
  assert.equal(pret,false);
});

test('tlačítko UPDATE se nezalomí ani s širším písmem (zkrátí text)',async()=>{
  for(const w of [320,360]){
    const p=await ovladac({viewport:{width:w,height:800}});
    await p.addStyleTag({content:'*{font-family:"DejaVu Sans",Verdana,sans-serif!important}'});
    await p.click('#ecgbtn');
    assert.equal(await p.evaluate(()=>$('upd').scrollWidth>$('upd').clientWidth),false,`UPDATE ${w} px`);
    await p.click('#autob');
    assert.equal(await p.evaluate(()=>$('upd').scrollWidth>$('upd').clientWidth),false,`Odesílat ihned ${w} px`);
  }
});
