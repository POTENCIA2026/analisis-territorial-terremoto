const fs=require('node:fs'),assert=require('node:assert/strict');
const P=require('../web/priorizacion.js'),T=require('../web/modelo.js'),C=require('../web/comparacion.js');
const html=fs.readFileSync('index.html','utf8'),match=html.match(/const DATA=([\s\S]*?);<\/script>/);
assert.ok(match,'Payload incorporado en index.html');
const data=JSON.parse(match[1]),models=P.models(data),territorial=T.create(data),proxy=data.denominators.registry_proxies;
assert.ok(proxy?.enabled);assert.equal(proxy.audit.imputed,0);
assert.equal(P.SECTORS.length,5);assert.equal(P.FIELD_COUNT,15);
assert.ok(data.rows.some(r=>/comuni/.test(r.id)),'Datos comunitarios conservados en diagnóstico');
assert.equal(proxy.rows.find(r=>r.code==='27050'&&r.kind==='sedes_ips').value,3);
const output={base_commit:'5dd41e1b281f9afbd5291bbfc35054b54a04eebb',capture:data.latest,generated:data.generated,
 sectors:P.SECTORS.map(s=>({id:s.id,weight:1/5,fields:s.fields.map(f=>({id:f.id,weight:f.share}))})),source_audit:proxy.audit,scopes:{}};
for(const scope of ['decree','all']){
 const state={scope,date:data.latest,dept:''},results={};
 for(const mode of ['absolute','percapita','sectorial']){
  const r=models[mode].compute(state);
  for(const m of r.all){
   assert.equal(m.sectors.length,5);assert.equal(m.fieldCount,15);
   assert.ok(Number.isFinite(m.lower)&&m.lower>=0&&m.lower<=m.upper+1e-8&&m.upper<=100+1e-8);
   assert.ok(Math.abs(m.damageLower-m.sectors.reduce((n,s)=>n+s.lower,0)/5)<1e-8);
   assert.ok(Math.abs(m.coverage-m.sectors.reduce((n,s)=>n+s.coverage,0)/5)<1e-8);
  }
  const comparison=C.compare(models,territorial,state,{mode,panel:'available',axis:'value'});
  results[mode]={reference:r.referenceN,scored:r.items.length,missing:r.missing.length,
   coverage:Object.fromEntries(P.SECTORS.map((s,i)=>[s.id,{with_score:r.all.filter(m=>m.sectors[i].coverage>0).length,complete:r.all.filter(m=>m.sectors[i].coverage>1-1e-8).length}])),
   comparison:{n:comparison.n,r2:comparison.regression?.r2??null,pearson:comparison.regression?.r??null,spearman:comparison.rho},
   top10:r.items.slice(0,10).map(m=>({code:m.code,municipality:m.m,lower:m.lower,upper:m.upper,available:m.available})),
   calibration:r.calibrations,
   examples:r.all.filter(m=>['27050','27660','66001','76828'].includes(m.code)).map(m=>({code:m.code,name:m.m,rank:r.items.find(x=>x.geo===m.geo)?.rank??null,lower:m.lower,
    sectors:m.sectors.filter(s=>['salud','educacion'].includes(s.id)).map(s=>({id:s.id,lower:s.lower,upper:s.upper,fields:s.fields.map(f=>({id:f.id,numerator:f.row?.v??null,base:f.denominator?.value??null,rate:f.rate,anchor:f.anchor,score:f.score,reason:f.reason}))}))}))};
  if(mode==='sectorial'){
   results[mode].exceeds_registry=r.all.flatMap(m=>m.sectors.flatMap(s=>s.fields.filter(f=>f.exceedsRegistry).map(f=>({code:m.code,name:m.m,id:f.id,numerator:f.row.v,base:f.denominator.value,ratio:f.rate}))));
   for(const id of ['3is_salud','pnud_csalud','3is_educativos','pnud_cedu']){
    const available=r.all.flatMap(m=>m.sectors.flatMap(s=>s.fields.filter(f=>f.id===id&&f.score!=null)));
    assert.ok(available.length>0,'Hay datos relativos para '+id);
    for(const f of available){
     assert.equal(f.denominator.status,'observed_registry_proxy');
     assert.ok(Math.abs(f.rate-f.row.v/f.denominator.value)<1e-10);
    }
   }
  }
 }
 output.scopes[scope]=results;
}
fs.writeFileSync('docs/verificacion_reps_simat.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({capture:output.capture,sources:output.source_audit,results:Object.fromEntries(Object.entries(output.scopes).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([mode,x])=>[mode,{reference:x.reference,scored:x.scored,coverage:x.coverage,comparison:x.comparison}]))]))},null,2));
