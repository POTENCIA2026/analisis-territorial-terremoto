const fs=require('node:fs'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const P=require('../web/priorizacion.js');
const parse=html=>JSON.parse(html.match(/const DATA=([\s\S]*?);<\/script>/)[1]);
const data=parse(fs.readFileSync('index.html','utf8')),sha=data.healthPressure.education_relative_policy.baseline_commit;
assert.match(sha,/^[a-f0-9]{40}$/);
assert.deepEqual(data.healthPressure.disabled_relative_indicators,[]);
assert.equal(data.healthPressure.education_relative_policy.enabled,true);
assert.ok(!data.healthPressure.excluded_sectors?.length);
const beforeData=parse(execFileSync('git',['show',sha+':index.html'],{encoding:'utf8',maxBuffer:64*1024*1024}));
for(const key of ['rows','baseline','population','denominators','latest','dates'])assert.deepEqual(data[key],beforeData[key]);
assert.deepEqual(data.healthPressure.capacity,beforeData.healthPressure.capacity);
assert.deepEqual(beforeData.healthPressure.disabled_relative_indicators,['pnud_cedu','3is_educativos']);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
const output={baseline_commit:sha,capture:data.latest,dimensions:5,fields:10,policy:'Educación relativa reactivada; datos, Salud, absoluto y per cápita preservados',scopes:{}};
for(const scope of ['decree','all']){
 const state={scope,date:data.latest,dept:''};
 for(const mode of ['absolute','percapita'])assert.deepEqual(P.models(data)[mode].compute(state),P.models(beforeData)[mode].compute(state),'Sin cambio '+mode);
 const before=P.models(beforeData).sectorial.compute(state),now=P.models(data).sectorial.compute(state),previous=new Map(before.all.map(r=>[r.geo,r]));
 assert.equal(now.definitions.length,5);assert.equal(now.scenarios,33);
 assert.deepEqual(now.calibrations.filter(c=>c.id!=='pnud_cedu'),before.calibrations.filter(c=>c.id!=='pnud_cedu'));
 for(const r of now.all){
  assert.equal(r.fieldCount,10);assert.equal(r.sectors.length,5);const b=previous.get(r.geo);
  for(const s of r.sectors){
   const old=b.sectors.find(x=>x.id===s.id);
   if(s.id!=='educacion'){assert.deepEqual(s,old);continue;}
   const f=s.fields[0];assert.ok(!f.calculationDisabled);
   assert.deepEqual(f.row,old.fields[0].row);assert.deepEqual(f.denominator,old.fields[0].denominator);
   if(f.score!=null){
    assert.equal(s.coverage,1);close(f.rate,f.row.v/f.denominator.value);
    close(f.score,f.rate===0?0:100*f.rate/f.anchor);close(s.lower,s.upper);
   }else{assert.equal(s.coverage,0);assert.equal(s.lower,0);assert.equal(s.upper,100);}
  }
  close(r.damageLower,r.sectors.reduce((sum,s)=>sum+s.lower,0)/5);
  close(r.damageUpper,r.sectors.reduce((sum,s)=>sum+s.upper,0)/5);
  close(r.coverage,r.sectors.reduce((sum,s)=>sum+s.coverage,0)/5);
 }
 const education=now.calibrations.find(c=>c.id==='pnud_cedu');
 assert.ok(education.n>0);
 output.scopes[scope]={reference:now.referenceN,relative_with_score:now.items.length,
 education_with_relative_score:now.all.filter(r=>r.sectors.find(s=>s.id==='educacion').coverage>0).length,
 education_anchor:education.anchor,health_with_data:now.all.filter(r=>r.sectors.find(s=>s.id==='salud').coverage>0).length,
 absolute_percapita_equal_to_baseline:true,other_sectors_equal_to_baseline:true};
}
fs.writeFileSync('docs/verificacion_educacion_relativa.json',JSON.stringify(output,null,2)+'\n');
console.log('Education reactivation verified',JSON.stringify(output));
