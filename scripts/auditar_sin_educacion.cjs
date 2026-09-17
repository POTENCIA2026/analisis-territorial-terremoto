const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createRequire}=require('node:module'),path=require('node:path');
const P=require('../web/priorizacion.js');
const parse=html=>JSON.parse(html.match(/const DATA=([\s\S]*?);<\/script>/)[1]);
const data=parse(fs.readFileSync('index.html','utf8')),sha=data.healthPressure.sector_exclusion.parent_commit;
assert.match(sha,/^[a-f0-9]{40}$/);
assert.deepEqual(data.healthPressure.excluded_sectors,['educacion']);
const git=p=>execFileSync('git',['show',sha+':'+p],{encoding:'utf8',maxBuffer:64*1024*1024});
const beforeData=parse(git('index.html'));
for(const key of ['rows','baseline','population','denominators','latest','dates'])assert.deepEqual(data[key],beforeData[key],'Inventario preservado: '+key);
assert.deepEqual(data.healthPressure.capacity,beforeData.healthPressure.capacity);
const sandbox={module:{exports:{}},require:createRequire(path.resolve('web/priorizacion.js'))};vm.runInNewContext(git('web/priorizacion.js'),sandbox);
const parent=sandbox.module.exports,clean=x=>JSON.parse(JSON.stringify(x)),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8);
const output={parent_commit:sha,capture:data.latest,dimensions:4,fields:9,education_raw_rows:data.rows.filter(r=>r.id==='pnud_cedu'||r.id==='3is_educativos').length,formula:'D = (Impacto humano + Vivienda + Salud + Infraestructura) / 4',scopes:{}};
assert.ok(output.education_raw_rows>0);
for(const scope of ['decree','all']){
 const state={scope,date:data.latest,dept:''},modes={};
 for(const mode of ['absolute','percapita','sectorial']){
  const previous=parent.models(beforeData)[mode].compute(state),now=P.models(data)[mode].compute(state),old=new Map(previous.all.map(r=>[r.geo,r]));
  assert.equal(now.referenceN,previous.referenceN);
  assert.deepEqual(clean(now.calibrations),clean(previous.calibrations.filter(c=>c.id!=='pnud_cedu')));
  assert.deepEqual(now.definitions.map(s=>s.id),['impacto_humano','vivienda','salud','infraestructura']);
  assert.equal(now.scenarios,27);
  for(const r of now.all){
   const b=old.get(r.geo);assert.equal(r.fieldCount,9);assert.equal(r.sectors.length,4);
   assert.equal(r.vulnerability,b.vulnerability);assert.equal(r.recovery,b.recovery);
   for(const s of r.sectors){
    const before=b.sectors.find(x=>x.id===s.id);
    for(const k of ['lower','upper','coverage'])assert.equal(s[k],before[k]);
    for(const f of s.fields){
     const bf=before.fields.find(x=>x.id===f.id);
     const {contribution,...rest}=f,{contribution:oldContribution,...oldRest}=bf;
     assert.deepEqual(clean(rest),clean(oldRest),'Variable intacta: '+r.code+'/'+f.id);
     if(f.score!=null)close(f.contribution,f.score*f.share/4);
    }
   }
   close(r.damageLower,r.sectors.reduce((v,s)=>v+s.lower,0)/4);
   close(r.damageUpper,r.sectors.reduce((v,s)=>v+s.upper,0)/4);
   close(r.coverage,r.sectors.reduce((v,s)=>v+s.coverage,0)/4);
   close(r.lower,r.damageLower*(1+.25*(r.vulnerability??0)/100)/1.25);
  }
  const entry=r=>({code:r.code,name:r.m,score:r.lower,rank:r.rank,previous_score:old.get(r.geo).lower,previous_rank:previous.items.find(x=>x.geo===r.geo)?.rank??null});
  modes[mode]={reference:now.referenceN,with_score:now.items.length,health_with_data:now.all.filter(r=>r.sectors.find(s=>s.id==='salud').coverage>0).length,top10:now.items.slice(0,10).map(entry),examples:now.items.filter(r=>['27050','66001','76828','76001'].includes(r.code)).map(entry)};
 }
 output.scopes[scope]=modes;
}
fs.writeFileSync('docs/verificacion_sin_educacion.json',JSON.stringify(output,null,2)+'\n');
console.log('Education removal verified',JSON.stringify(output));
