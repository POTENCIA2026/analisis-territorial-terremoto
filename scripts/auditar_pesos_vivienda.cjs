const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createRequire}=require('node:module'),path=require('node:path');
const P=require('../web/priorizacion.js'),T=require('../web/modelo.js'),C=require('../web/comparacion.js');
const parse=html=>JSON.parse(html.match(/const DATA=([\s\S]*?);<\/script>/)[1]);
const data=parse(fs.readFileSync('index.html','utf8')),policy=data.healthPressure.housing_weight_policy;
assert.equal(policy.enabled,true);assert.equal(policy.destroyed,2);assert.equal(policy.damaged,1);assert.match(policy.baseline_commit,/^[a-f0-9]{40}$/);
const git=p=>execFileSync('git',['show',policy.baseline_commit+':'+p],{encoding:'utf8',maxBuffer:64*1024*1024});
const beforeData=parse(git('index.html'));
const sandbox={module:{exports:{}},require:createRequire(path.resolve('web/priorizacion.js'))};vm.runInNewContext(git('web/priorizacion.js'),sandbox);
const oldP=sandbox.module.exports,clean=x=>JSON.parse(JSON.stringify(x)),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
for(const key of ['rows','baseline','population','denominators','latest','dates'])assert.deepEqual(data[key],beforeData[key]);
const {housing_weight_policy,...otherConfig}=data.healthPressure;assert.deepEqual(otherConfig,beforeData.healthPressure);
const stripWeight=({share,contribution,...rest})=>rest;
const output={baseline_commit:policy.baseline_commit,capture:data.latest,formula:'Vivienda = (2 × z_destruidas + z_averiadas) / 3',sector_weight:1/5,original_data_unchanged:true,scopes:{}};
for(const scope of ['decree','all']){
 const state={scope,date:data.latest,dept:''},modes={};
 for(const mode of ['absolute','percapita','sectorial']){
  const old=oldP.models(beforeData)[mode].compute(state),now=P.models(data)[mode].compute(state),byGeo=new Map(old.all.map(r=>[r.geo,r]));
  assert.equal(now.referenceN,old.referenceN);assert.deepEqual(clean(now.calibrations.map(stripWeight)),clean(old.calibrations.map(stripWeight)));
  for(const r of now.all){
   const b=byGeo.get(r.geo);assert.equal(r.fieldCount,10);assert.equal(r.available,b.available);assert.equal(r.sectors.length,5);
   assert.equal(r.vulnerability,b.vulnerability);assert.equal(r.recovery,b.recovery);
   for(const s of r.sectors){
    const prev=b.sectors.find(x=>x.id===s.id);
    if(s.id!=='vivienda'){assert.deepEqual(clean(s),clean(prev));continue;}
    assert.deepEqual(s.fields.map(f=>f.share),[2/3,1/3]);
    s.fields.forEach((f,i)=>{assert.deepEqual(clean(stripWeight(f)),clean(stripWeight(prev.fields[i])));if(f.score!=null)close(f.contribution,f.score*f.share/5);});
    close(s.lower,s.fields.reduce((n,f)=>n+(f.score??0)*f.share,0));
    close(s.upper,s.lower+s.fields.filter(f=>f.score==null).reduce((n,f)=>n+100*f.share,0));
    close(s.coverage,s.fields.filter(f=>f.score!=null).reduce((n,f)=>n+f.share,0));
   }
   close(r.damageLower,r.sectors.reduce((n,s)=>n+s.lower,0)/5);
   close(r.damageUpper,r.sectors.reduce((n,s)=>n+s.upper,0)/5);
   close(r.coverage,r.sectors.reduce((n,s)=>n+s.coverage,0)/5);
   close(r.lower,r.damageLower*(1+.25*(r.vulnerability??0)/100)/1.25);
   close(r.upper,r.damageUpper*(1+.25*(r.vulnerability??100)/100)/1.25);
  }
  const nowRanks=new Map(now.items.map(r=>[r.geo,r.rank])),oldRanks=new Map(old.items.map(r=>[r.geo,r.rank]));
  const example=code=>{const r=now.all.find(r=>r.code===code),b=byGeo.get(r.geo),s=r.sectors.find(s=>s.id==='vivienda');return {code,name:r.m,previous_housing:b.sectors.find(s=>s.id==='vivienda').lower,housing:s.lower,previous_score:b.lower,score:r.lower,previous_rank:oldRanks.get(r.geo),rank:nowRanks.get(r.geo),fields:s.fields.map(f=>({id:f.id,source:f.source,raw:f.row?.v??null,score:f.score,weight:f.share}))};};
  const comparison=C.compare(P.models(data),T.create(data),state,{mode,panel:'available',axis:'value'});
  modes[mode]={reference:now.referenceN,with_score:now.items.length,other_sectors_unchanged:true,individual_scores_and_anchors_unchanged:true,comparison:{n:comparison.n,r2:comparison.regression?.r2,r:comparison.regression?.r,rho:comparison.rho},pereira:example('66001'),top:now.items.slice(0,5).map(r=>({name:r.m,department:r.d,score:r.lower,rank:r.rank}))};
 }
 output.scopes[scope]=modes;
}
fs.writeFileSync('docs/verificacion_pesos_vivienda.json',JSON.stringify(output,null,2)+'\n');
console.log('Housing weights verified',JSON.stringify(output));
