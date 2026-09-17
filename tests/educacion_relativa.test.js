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
