
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../web/priorizacion.js');
const date='2026-09-16',state={scope:'all',date},modes=['absolute','percapita','sectorial'],codes=['27050','27660'];
const row=(code,id,v)=>({geo:'municipal:'+code,code,lv:'municipal',m:code,d:'Chocó',date,id,f:'3iS-Sheets',u:'Número',dim:'Impacto humano',i:id,v});
function fixture(){
 return {rows:codes.flatMap((code,i)=>[row(code,'3is_familias',100*(i+1)),row(code,'3is_fallecidos',i+1),row(code,'3is_desaparecidos',2-i)]),
 latest:date,dates:[date],baseline:{rows:[]},population:{rows:codes.map(code=>({code,year:2026,population:1000}))},
 healthPressure:{enabled:false,source_cascade:{enabled:true},human_impact_policy:{families_informational_only:true}},
 denominators:{event_date:'2026-08-10',sources:{dane:{url:'https://www.dane.gov.co/',published:'2025-12-24',sha256:'a'.repeat(64)}},rows:codes.map(code=>({code,year:2026,kind:'poblacion',value:1000,unit:'Habitantes',source:'dane',reference_date:'2026-06-30',area:'Total',status:'verified'}))}};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' != '+b);
const projection=r=>({geo:r.geo,lower:r.lower,upper:r.upper,coverage:r.coverage,available:r.available,fieldCount:r.fieldCount,rank:r.rank,rankMin:r.rankMin,rankMax:r.rankMax,bestRank:r.bestRank,worstRank:r.worstRank});
test('familias se conserva visible pero solo fallecidos y desaparecidos tienen peso',()=>{
 for(const mode of modes){
  const r=P.models(fixture())[mode].compute(state).all[0],s=r.sectors[0];
  assert.deepEqual(s.fields.map(f=>f.id),['3is_familias','3is_fallecidos','3is_desaparecidos']);
  assert.deepEqual(s.fields.map(f=>f.share),[0,.5,.5]);assert.equal(s.fields[0].row.v,100);assert.equal(s.fields[0].contribution,0);
  close(s.lower,(s.fields[1].score+s.fields[2].score)/2);close(s.coverage,1);assert.equal(r.available,2);assert.equal(r.fieldCount,9);
 }
});
test('cambiar radicalmente familias no cambia ningún resultado del índice',()=>{
 const d=fixture(),altered=structuredClone(d);altered.rows.filter(r=>r.id==='3is_familias').forEach((r,i)=>r.v=i?1e12:0);
 for(const mode of modes)assert.deepEqual(P.models(d)[mode].compute(state).items.map(projection),P.models(altered)[mode].compute(state).items.map(projection));
});
test('familias sin dato no reduce cobertura ni amplía el intervalo humano',()=>{
 const d=fixture();d.rows=d.rows.filter(r=>r.id!=='3is_familias');
 for(const mode of modes)for(const r of P.models(d)[mode].compute(state).all){
  const s=r.sectors[0];assert.equal(s.fields[0].row,null);assert.equal(s.fields[0].contribution,0);assert.equal(s.coverage,1);close(s.upper,s.lower);
 }
});
test('una variable humana faltante conserva medio sector desconocido; no se divide por disponibles',()=>{
 const d=fixture();d.rows=d.rows.filter(r=>!(r.code===codes[0]&&r.id==='3is_desaparecidos'));
 for(const mode of modes){const r=P.models(d)[mode].compute(state).all.find(r=>r.code===codes[0]),s=r.sectors[0];
  close(s.lower,s.fields[1].score/2);close(s.upper,s.lower+50);close(s.coverage,.5);assert.equal(r.available,1);
 }
});
test('solo familias no da puntaje y los ceros explícitos de personas siguen siendo conocidos',()=>{
 const d=fixture();d.rows=d.rows.filter(r=>r.id==='3is_familias');
 for(const mode of modes){const r=P.models(d)[mode].compute(state);assert.equal(r.items.length,0);assert.equal(r.all[0].coverage,0);assert.equal(r.all[0].available,0);}
 const zero=fixture();zero.rows.filter(r=>r.id!=='3is_familias').forEach(r=>r.v=0);
 for(const mode of modes){const s=P.models(zero)[mode].compute(state).all[0].sectors[0];assert.equal(s.lower,0);assert.equal(s.upper,0);assert.equal(s.coverage,1);}
});
test('política ausente conserva la configuración histórica de tres pesos iguales',()=>{
 const d=fixture();delete d.healthPressure.human_impact_policy;
 const r=P.models(d).absolute.compute(state).all[0];assert.equal(r.fieldCount,10);assert.deepEqual(r.sectors[0].fields.map(f=>f.share),[1/3,1/3,1/3]);
});
