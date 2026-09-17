const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createRequire}=require('node:module'),path=require('node:path');
const P=require('../web/priorizacion.js');
const parse=html=>JSON.parse(html.match(/const DATA=([\s\S]*?);<\/script>/)[1]);
const data=parse(fs.readFileSync('index.html','utf8')),sha=data.healthPressure.education_relative_policy.baseline_commit;
assert.match(sha,/^[a-f0-9]{40}$/);
assert.deepEqual(data.healthPressure.disabled_relative_indicators,['pnud_cedu','3is_educativos']);
assert.ok(!data.healthPressure.excluded_sectors?.length);
const git=p=>execFileSync('git',['show',sha+':'+p],{encoding:'utf8',maxBuffer:64*1024*1024});
const beforeData=parse(git('index.html'));
for(const key of ['rows','baseline','population','denominators','latest','dates'])assert.deepEqual(data[key],beforeData[key]);
assert.deepEqual(data.healthPressure.capacity,beforeData.healthPressure.capacity);
const sandbox={module:{exports:{}},require:createRequire(path.resolve('web/priorizacion.js'))};vm.runInNewContext(git('web/priorizacion.js'),sandbox);
const parent=sandbox.module.exports,clean=x=>JSON.parse(JSON.stringify(x)),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8);
const output={baseline_commit:sha,capture:data.latest,dimensions:5,fields:10,policy:'Solo Educación relativa sin cálculo; se restauran absoluto/per cápita y los cinco sectores',scopes:{}};
for(const scope of ['decree','all']){
 const state={scope,date:data.latest,dept:''};
 for(const mode of ['absolute','percapita'])assert.deepEqual(clean(P.models(data)[mode].compute(state)),clean(parent.models(beforeData)[mode].compute(state)),'Restauración exacta '+mode);
 const before=parent.models(beforeData).sectorial.compute(state),now=P.models(data).sectorial.compute(state),previous=new Map(before.all.map(r=>[r.geo,r]));
 assert.equal(now.definitions.length,5);assert.equal(now.scenarios,33);
 assert.deepEqual(clean(now.calibrations.filter(c=>c.id!=='pnud_cedu')),clean(before.calibrations.filter(c=>c.id!=='pnud_cedu')));
 for(const r of now.all){
  assert.equal(r.fieldCount,10);assert.equal(r.sectors.length,5);const b=previous.get(r.geo);
  for(const s of r.sectors){
   const old=b.sectors.find(x=>x.id===s.id);
   if(s.id!=='educacion'){assert.deepEqual(clean(s),clean(old));continue;}
   assert.equal(s.lower,0);assert.equal(s.upper,100);assert.equal(s.coverage,0);
   const f=s.fields[0];assert.equal(f.rate,null);assert.equal(f.score,null);assert.equal(f.calculationDisabled,true);
   assert.deepEqual(clean(f.row),clean(old.fields[0].row));
  }
  close(r.damageLower,r.sectors.reduce((sum,s)=>sum+s.lower,0)/5);
  close(r.damageUpper,r.sectors.reduce((sum,s)=>sum+s.upper,0)/5);
  close(r.coverage,r.sectors.reduce((sum,s)=>sum+s.coverage,0)/5);
 }
 output.scopes[scope]={reference:now.referenceN,relative_with_score:now.items.length,education_with_relative_score:now.all.filter(r=>r.sectors.find(s=>s.id==='educacion').coverage>0).length,health_with_data:now.all.filter(r=>r.sectors.find(s=>s.id==='salud').coverage>0).length,absolute_percapita_equal_to_baseline:true};
}
fs.writeFileSync('docs/verificacion_educacion_relativa.json',JSON.stringify(output,null,2)+'\n');
console.log('Correction verified',JSON.stringify(output));
