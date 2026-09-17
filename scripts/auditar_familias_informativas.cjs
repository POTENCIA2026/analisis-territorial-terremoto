const fs=require('node:fs'),assert=require('node:assert/strict');
const P=require('../web/priorizacion.js'),T=require('../web/modelo.js'),C=require('../web/comparacion.js');
const data=JSON.parse(fs.readFileSync('index.html','utf8').match(/const DATA=([\s\S]*?);<\/script>/)[1]);
assert.equal(data.healthPressure.human_impact_policy.families_informational_only,true);
const beforeData={...data,healthPressure:{...data.healthPressure,human_impact_policy:{families_informational_only:false}}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b),strip=({share,contribution,...f})=>f;
const output={capture:data.latest,formula:'Impacto humano = (z_fallecidos + z_desaparecidos) / 2',displayed_fields:10,scored_fields:9,families_visible:true,families_weight:0,scopes:{}};
for(const scope of ['decree','all']){
 const state={scope,date:data.latest,dept:''};output.scopes[scope]={};
 for(const mode of ['absolute','percapita','sectorial']){
  const now=P.models(data)[mode].compute(state),before=P.models(beforeData)[mode].compute(state),old=new Map(before.all.map(r=>[r.geo,r]));
  assert.equal(now.referenceN,before.referenceN);assert.deepEqual(now.calibrations.map(strip),before.calibrations.map(strip));
  for(const r of now.all){
   const b=old.get(r.geo),h=r.sectors[0],bh=b.sectors[0];
   assert.equal(r.fieldCount,9);assert.equal(r.sectors.flatMap(s=>s.fields).length,10);
   assert.deepEqual(h.fields.map(f=>f.share),[0,.5,.5]);assert.deepEqual(h.fields.map(strip),bh.fields.map(strip));
   assert.equal(h.fields[0].contribution,0);
   const active=h.fields.slice(1);close(h.lower,active.reduce((n,f)=>n+(f.score??0),0)/2);
   close(h.upper,h.lower+active.filter(f=>f.score==null).length*50);close(h.coverage,active.filter(f=>f.score!=null).length/2);
   assert.equal(r.available,b.available-(bh.fields[0].score!=null?1:0));
   for(let i=1;i<5;i++)assert.deepEqual(r.sectors[i],b.sectors[i]);
   close(r.damageLower,r.sectors.reduce((n,s)=>n+s.lower,0)/5);close(r.damageUpper,r.sectors.reduce((n,s)=>n+s.upper,0)/5);
   close(r.coverage,r.sectors.reduce((n,s)=>n+s.coverage,0)/5);
   close(r.lower,r.damageLower*(1+.25*(r.vulnerability??0)/100)/1.25);
   close(r.upper,r.damageUpper*(1+.25*(r.vulnerability??100)/100)/1.25);
  }
  const p=now.items.find(r=>r.code==='66001'),b=old.get(p.geo),comparison=C.compare(P.models(data),T.create(data),state,{mode,panel:'available',axis:'value'});
  assert.ok(comparison.pairs.every(r=>r.fieldCount===9));
  output.scopes[scope][mode]={reference:now.referenceN,with_score:now.items.length,other_sectors_unchanged:true,individual_scores_unchanged:true,comparison:{n:comparison.n,r2:comparison.regression?.r2,rho:comparison.rho},
   pereira:{families:p.sectors[0].fields[0].row.v,previous_human:b.sectors[0].lower,human:p.sectors[0].lower,previous_score:b.lower,score:p.lower,upper:p.upper,rank:p.rank,coverage:p.coverage,available:p.available}};
 }
}
fs.writeFileSync('docs/verificacion_familias_informativas.json',JSON.stringify(output,null,2)+'\n');
console.log('Informational families verified',JSON.stringify(output));
