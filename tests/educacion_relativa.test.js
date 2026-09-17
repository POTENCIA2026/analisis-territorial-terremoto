const test=require('node:test'),assert=require('node:assert/strict'),P=require('../web/priorizacion.js');
const date='2026-09-16',state={scope:'all',date};
const row=(id,v,code='27050')=>({geo:'municipal:'+code,code,lv:'municipal',m:code,d:'Chocó',date,id,f:id.startsWith('pnud_')?'PNUD':'3iS-Sheets',u:'Número',dim:'Daños',i:id,v});
function fixture(){
 return {rows:[row('pnud_cedu',5),row('3is_educativos',6),row('pnud_cedu',10,'27660'),row('pnud_vd',1)],latest:date,dates:[date],baseline:{rows:[]},
 population:{rows:['27050','27660'].map(code=>({code,population:1000,year:2026}))},
 healthPressure:{enabled:false,source_cascade:{enabled:true},disabled_relative_indicators:['pnud_cedu','3is_educativos']},
 denominators:{event_date:'2026-08-10',sources:{},rows:[],registry_proxies:{enabled:true,
 catalog:{sedes_educativas:{year:2022,unit:'Sedes educativas',source:'men',reference_date:'2022-12-31',label:'MEN'}},
 sources:{men:{url:'https://portalsineb.mineducacion.gov.co/',sha256:'a'.repeat(64)}},
 rows:['27050','27660'].map(code=>({code,kind:'sedes_educativas',value:20,year:2022,unit:'Sedes educativas',source:'men',reference_date:'2022-12-31',area:'Total',status:'observed_registry_proxy'}))}}};
}
test('solo el relativo educativo se deshabilita; otros modelos quedan idénticos',()=>{
 const d=fixture(),before=structuredClone(d);before.healthPressure.disabled_relative_indicators=[];
 for(const mode of ['absolute','percapita'])assert.deepEqual(P.models(d)[mode].compute(state),P.models(before)[mode].compute(state));
 const a=P.models(d).sectorial.compute(state),b=P.models(before).sectorial.compute(state);
 assert.equal(a.definitions.length,5);assert.equal(a.scenarios,33);
 for(const r of a.all){
  assert.equal(r.fieldCount,10);
  const e=r.sectors.find(s=>s.id==='educacion'),old=b.all.find(x=>x.code===r.code);
  assert.equal(e.fields.length,1);assert.equal(e.fields[0].rate,null);assert.equal(e.fields[0].score,null);
  assert.equal(e.coverage,0);assert.equal(e.lower,0);assert.equal(e.upper,100);assert.equal(e.fields[0].calculationDisabled,true);
  assert.ok(e.fields[0].row.v>=0);assert.equal(e.fields[0].denominator.value,20);
  assert.ok(old.sectors.find(s=>s.id==='educacion').fields[0].score>=0);
  for(const s of r.sectors)if(s.id!=='educacion')assert.deepEqual(s,old.sectors.find(x=>x.id===s.id));
 }
});
test('cero educativo se conserva como conteo, no como puntaje relativo',()=>{
 const d=fixture();d.rows[0].v=0;
 const e=P.models(d).sectorial.compute(state).all.find(r=>r.code==='27050').sectors.find(s=>s.id==='educacion').fields[0];
 assert.equal(e.row.v,0);assert.equal(e.score,null);assert.equal(e.rate,null);
 assert.equal(P.models(d).absolute.compute(state).all.find(r=>r.code==='27050').sectors.find(s=>s.id==='educacion').fields[0].score,0);
});
test('3iS de respaldo tampoco reactiva el cálculo relativo',()=>{
 const d=fixture();d.rows=d.rows.filter(r=>r.id!=='pnud_cedu');
 const e=P.models(d).sectorial.compute(state).all.find(r=>r.code==='27050').sectors.find(s=>s.id==='educacion').fields[0];
 assert.equal(e.row.id,'3is_educativos');assert.equal(e.score,null);assert.equal(e.rate,null);
});

test('reactivar Educación recupera tasa y puntaje sin alterar absoluto, per cápita ni otros sectores',()=>{
 const before=fixture(),d=structuredClone(before);d.healthPressure.disabled_relative_indicators=[];
 for(const mode of ['absolute','percapita'])assert.deepEqual(P.models(d)[mode].compute(state),P.models(before)[mode].compute(state));
 const after=P.models(d).sectorial.compute(state),previous=P.models(before).sectorial.compute(state);
 for(const r of after.all){
  const old=previous.all.find(x=>x.code===r.code),e=r.sectors.find(s=>s.id==='educacion'),f=e.fields[0];
  assert.equal(r.fieldCount,10);assert.equal(r.sectors.length,5);
  assert.equal(e.coverage,1);assert.equal(f.rate,f.row.v/f.denominator.value);
  assert.equal(f.score,100*f.rate/.5);assert.equal(e.lower,e.upper);
  assert.ok(!f.calculationDisabled);assert.equal(f.row.f,'PNUD');
  for(const s of r.sectors)if(s.id!=='educacion')assert.deepEqual(s,old.sectors.find(x=>x.id===s.id));
 }
});
test('reactivado conserva cero PNUD y aplica 3iS solo cuando falta PNUD',()=>{
 const d=fixture();d.healthPressure.disabled_relative_indicators=[];d.rows[0].v=0;
 const field=()=>P.models({...d}).sectorial.compute(state).all.find(r=>r.code==='27050').sectors.find(s=>s.id==='educacion').fields[0];
 assert.equal(field().score,0);assert.equal(field().rate,0);assert.equal(field().row.f,'PNUD');
 d.rows=d.rows.filter(r=>!(r.code==='27050'&&r.id==='pnud_cedu'));
 assert.equal(field().row.f,'3iS-Sheets');assert.equal(field().rate,6/20);assert.equal(field().score,60);
});
test('reactivado no calcula Educación si falta el inventario municipal',()=>{
 const d=fixture();d.healthPressure.disabled_relative_indicators=[];
 d.denominators.registry_proxies.rows=d.denominators.registry_proxies.rows.filter(r=>r.code!=='27050');
 const e=P.models(d).sectorial.compute(state).all.find(r=>r.code==='27050').sectors.find(s=>s.id==='educacion');
 assert.equal(e.fields[0].score,null);assert.equal(e.coverage,0);
});

function cappedFixture(){
 const d=fixture();d.healthPressure.disabled_relative_indicators=[];
 d.healthPressure.education_relative_policy={enabled:true,normalization:'fixed_inventory_cap_1'};
 return d;
}
const education=(d,code='27050')=>P.models(d).sectorial.compute(state).all.find(r=>r.code===code).sectors.find(s=>s.id==='educacion');
test('tope educativo fijo: 25% y 50% no se reescalan por el máximo observado',()=>{
 const d=cappedFixture(),a=education(d).fields[0],b=education(d,'27660').fields[0];
 assert.equal(a.rate,.25);assert.equal(a.score,25);assert.equal(b.score,50);
 assert.equal(a.anchor,1);assert.equal(a.observedMax,.5);assert.equal(a.normalization,'fixed_inventory_cap_1');
});
test('100% y más de 100% dan 100 sin modificar numerador, base ni cociente',()=>{
 const d=cappedFixture();d.rows[0].v=25;d.denominators.registry_proxies.rows[0].value=17;d.rows[2].v=20;
 const a=education(d).fields[0],b=education(d,'27660').fields[0];
 assert.equal(a.row.v,25);assert.equal(a.denominator.value,17);assert.equal(a.rate,25/17);assert.equal(a.score,100);
 assert.equal(b.rate,1);assert.equal(b.score,100);assert.ok(a.exceedsRegistry);
});
test('tope conserva cero PNUD y respaldo 3iS sin usar un máximo',()=>{
 const d=cappedFixture();d.rows[0].v=0;
 assert.equal(education(d).fields[0].score,0);assert.equal(education(d).fields[0].row.f,'PNUD');
 const fallback={...d,rows:d.rows.filter(r=>!(r.code==='27050'&&r.id==='pnud_cedu'))};
 assert.equal(education(fallback).fields[0].row.f,'3iS-Sheets');assert.equal(education(fallback).fields[0].score,30);
});
test('tope no convierte en cero un numerador faltante ni usa inventarios ausentes o nulos',()=>{
 for(const issue of ['numerator','missing','zero']){
  const d=cappedFixture();
  if(issue==='numerator')d.rows=d.rows.filter(r=>!(r.code==='27050'&&['pnud_cedu','3is_educativos'].includes(r.id)));
  if(issue==='missing')d.denominators.registry_proxies.rows=d.denominators.registry_proxies.rows.filter(r=>r.code!=='27050');
  if(issue==='zero')d.denominators.registry_proxies.rows[0].value=0;
  const e=education(d);assert.equal(e.fields[0].score,null);assert.equal(e.coverage,0);assert.equal(e.upper,100);
 }
});
test('tope educativo no cambia absoluto, per cápita ni otros sectores',()=>{
 const d=cappedFixture(),before=structuredClone(d);delete before.healthPressure.education_relative_policy.normalization;
 for(const mode of ['absolute','percapita'])assert.deepEqual(P.models(d)[mode].compute(state),P.models(before)[mode].compute(state));
 const a=P.models(d).sectorial.compute(state),b=P.models(before).sectorial.compute(state);
 for(const r of a.all)for(const s of r.sectors)if(s.id!=='educacion')
  assert.deepEqual(s,b.all.find(x=>x.geo===r.geo).sectors.find(x=>x.id===s.id));
});
test('el mismo cociente conserva el puntaje al cambiar el universo',()=>{
 const d=cappedFixture(),subset={...d,rows:d.rows.filter(r=>r.code==='27050')};
 assert.equal(education(d).fields[0].score,education(subset).fields[0].score);
});
test('tope también funciona sin cascada para cada canal educativo',()=>{
 const d=cappedFixture();d.healthPressure.source_cascade.enabled=false;
 const fields=education(d).fields;assert.equal(fields.length,2);
 for(const f of fields){assert.equal(f.anchor,1);assert.equal(f.score,100*f.rate);}
});
