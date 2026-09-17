const test=require('node:test'),assert=require('node:assert/strict'),P=require('../web/priorizacion.js');
const date='2026-09-16',state={scope:'all',date};
const row=(id,v,code='27050')=>({geo:'municipal:'+code,code,lv:'municipal',m:code,d:'Chocó',date,id,f:id.startsWith('pnud_')?'PNUD':'3iS-Sheets',u:'Número',dim:'Daños',i:id,v});
function fixture(exclude=true){
 const fields=P.SECTORS.flatMap(s=>s.fields);
 return {rows:fields.flatMap(f=>[row(f.id,10),row(f.id,20,'27660')]),latest:date,dates:[date],baseline:{rows:[]},
 population:{rows:['27050','27660'].map(code=>({code,population:1000,year:2026}))},
 healthPressure:{enabled:false,source_cascade:{enabled:true},excluded_sectors:exclude?['educacion']:[]}};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8);
test('sin Educación hay cuatro dimensiones y nueve variables en todos los modos',()=>{
 for(const mode of ['absolute','percapita','sectorial']){
  const before=P.models(fixture(false))[mode].compute(state),after=P.models(fixture())[mode].compute(state);
  assert.deepEqual(after.definitions.map(s=>s.id),['impacto_humano','vivienda','salud','infraestructura']);
  assert.equal(after.scenarios,27);
  assert.deepEqual(after.calibrations,before.calibrations.filter(c=>c.id!=='pnud_cedu'));
  for(const r of after.all){
   const old=before.all.find(x=>x.geo===r.geo);
   assert.equal(r.fieldCount,9);assert.equal(r.sectors.length,4);
   assert.equal(r.available,old.available-old.sectors.find(s=>s.id==='educacion').fields.filter(f=>f.score!=null).length);
   for(const s of r.sectors){
    const prior=old.sectors.find(x=>x.id===s.id);
    for(const key of ['lower','upper','coverage'])assert.equal(s[key],prior[key]);
    for(const f of s.fields)if(f.score!=null)close(f.contribution,f.score*f.share/4);
   }
   close(r.damageLower,r.sectors.reduce((sum,s)=>sum+s.lower,0)/4);
   close(r.coverage,r.sectors.reduce((sum,s)=>sum+s.coverage,0)/4);
  }
 }
});
test('cambiar cifras educativas no cambia los puntajes; los datos originales siguen presentes',()=>{
 const a=fixture(),b=structuredClone(a);
 b.rows.filter(r=>r.id==='pnud_cedu'||r.id==='3is_educativos').forEach(r=>r.v=999999);
 for(const mode of ['absolute','percapita','sectorial']){
  const x=P.models(a)[mode].compute(state),y=P.models(b)[mode].compute(state);
  assert.deepEqual(x.calibrations,y.calibrations);
  for(const r of x.all){const other=y.all.find(s=>s.geo===r.geo);assert.equal(r.lower,other.lower);assert.equal(r.upper,other.upper);assert.deepEqual(r.sectors,other.sectors);}
 }
 assert.ok(a.rows.some(r=>r.id==='pnud_cedu'));
});
test('un municipio solo con Educación permanece consultable, sin puntaje propio fabricado',()=>{
 const d=fixture();d.rows=d.rows.filter(r=>r.id==='pnud_cedu'||r.id==='3is_educativos');
 const result=P.models(d).absolute.compute(state);
 assert.equal(result.items.length,0);assert.equal(result.missing.length,2);
 assert.equal(result.referenceN,2);
});
