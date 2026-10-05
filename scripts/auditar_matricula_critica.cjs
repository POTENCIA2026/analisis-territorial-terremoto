// Verifica el producto generado completo, no una segunda fórmula de presentación.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),P=require('../web/priorizacion.js'),E=require('../web/matricula_critica.js');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const data=JSON.parse(html.match(/const DATA=(.*?);<\/script>/s)[1]);
const old={...data,educationCritical:undefined},models=P.models(data),before=P.models(old);
assert.ok(!html.includes('id="tab-educacion"'));
assert.ok(!html.includes('__CRITICAL_ENROLLMENT__'));
assert.ok(Buffer.byteLength(html)<100*1024*1024,'index supera el límite de GitHub');
let comparisons=0;
for(const scope of ['all','decree'])for(const mode of ['absolute','percapita','sectorial']){
  const state={scope,date:data.latest},a=models[mode].compute(state),b=before[mode].compute(state);
  assert.equal(a.referenceN,b.referenceN);
  for(const r of a.all){
    const previous=b.all.find(x=>x.geo===r.geo);assert.ok(previous);
    for(const s of r.sectors.filter(s=>s.id!=='educacion')){
      assert.deepEqual(s,previous.sectors.find(x=>x.id===s.id));comparisons++;
    }
    const education=r.sectors.find(s=>s.id==='educacion'),prev=previous.sectors.find(s=>s.id==='educacion');
    assert.equal(education.fields.length,prev.fields.length+1);
    for(const f of prev.fields){
      const current=education.fields.find(x=>x.id===f.id);
      assert.equal(current.score,f.score);assert.equal(current.share,f.share*.5);
    }
  }
}
const state={scope:E.SCOPE,date:data.latest},a=models.absolute.compute(state),r=models.sectorial.compute(state);
assert.equal(a.referenceN,126);assert.equal(new Set(a.all.map(x=>x.code)).size,126);
assert.equal(a.all.filter(x=>x.sectors[3].fields.find(f=>f.id===E.ID).score!=null).length,121);
assert.equal(r.all.filter(x=>x.sectors[3].fields.find(f=>f.id===E.ID).score!=null).length,121);
const examples=['66001','27050','27660','76001'].map(code=>{
  const item=r.items.concat(r.missing).find(x=>x.code===code),sector=item.sectors[3],f=sector.fields.find(f=>f.id===E.ID);
  return {code,m:item.m,population:item.population?.population,numerator:f.row?.v??null,rate:f.rate,
    score:f.score,education:sector.lower,global:item.lower,rank:item.rank};
});
console.log(JSON.stringify({date:data.latest,unchanged_sector_objects:comparisons,
  universe:a.referenceN,coverage:121,examples},null,2));
