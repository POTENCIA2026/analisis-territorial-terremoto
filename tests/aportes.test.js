const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../web/priorizacion.js'),C=require('../web/comparacion.js');
const state={date:'2026-09-28',scope:'all'};
function fixture(){
  const definitions=P.SECTORS.map(({id,name})=>({id,name}));
  const place=(geo,d,values,coverage,ipm)=>{
    const sectors=definitions.map((s,i)=>({...s,lower:values[i],upper:coverage[i]?values[i]:100,coverage:coverage[i]}));
    return {geo,m:geo,d,sectors,vulnerability:ipm,...P.aggregate(sectors,ipm,[1,1,1,1,1])};
  };
  const rows=[place('A','D',[50,100,20,0,30],[1,1,1,1,1],20),place('B','Otro',[0,30,10,100,0],[1,1,1,1,0],null),
    place('C','D',[0,0,0,0,0],[0,1,0,0,0],0)];
  const items=P.ranks(rows),result={definitions,items,all:items,missing:[{geo:'missing',d:'D'}],referenceN:4};
  const models=Object.fromEntries(C.MODES.map(mode=>[mode,{compute:()=>result}]));
  return {models,result};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('los cinco aportes suman el índice y sus límites, incluido IPM ausente',()=>{
  const {models}=fixture();
  for(const mode of C.MODES){
    const c=C.contributions(models,state,{mode});
    for(const r of c.rows){
      near(r.contributions.reduce((n,s)=>n+s.lower,0),r.lower);
      near(r.contributions.reduce((n,s)=>n+s.upper,0),r.upper);
      near(r.selectedLower,r.lower);near(r.selectedUpper,r.upper);
      near(r.removed,0);assert.equal(r.selectedRank,r.rank);
    }
  }
});
test('aislar una dimensión mantiene 1/5 e IPM, sin redistribuir el peso',()=>{
  const {models}=fixture(),c=C.contributions(models,state,{included:['vivienda']});
  const a=c.rows.find(r=>r.geo==='A');
  near(a.selectedLower,100/5*(1+.25*.2)/1.25);
  near(a.removed,a.lower-a.selectedLower);
  const zero=c.rows.find(r=>r.geo==='C');
  assert.equal(zero.selectedKnown,true);assert.equal(zero.selectedLower,0);assert.ok(zero.selectedRank>0);
});
test('faltantes conservan límites y no reciben puesto; ceros observados sí',()=>{
  const {models}=fixture(),c=C.contributions(models,state,{included:['educacion']});
  const missing=c.rows.find(r=>r.geo==='C'),zero=c.rows.find(r=>r.geo==='A');
  assert.equal(missing.selectedKnown,false);assert.equal(missing.selectedRank,null);assert.ok(missing.selectedUpper>0);
  assert.equal(zero.selectedKnown,true);assert.equal(zero.selectedLower,0);assert.ok(zero.selectedRank>0);
});
test('sin dimensiones no se fabrican puestos; opciones inválidas se rechazan',()=>{
  const {models}=fixture();
  const c=C.contributions(models,state,{included:[]});
  assert.ok(c.rows.every(r=>r.selectedRank===null&&r.selectedLower===0&&r.selectedUpper===0));
  assert.throws(()=>C.contributions(models,state,{included:['inventada']}));
  assert.throws(()=>C.contributions(models,state,{mode:'otro'}));
});
test('filtros conservan referencias y resultados; el modelo no se modifica',()=>{
  const {models,result}=fixture(),before=structuredClone(result),options={included:['vivienda','educacion']};
  const full=C.contributions(models,state,options),sub=C.contributions(models,{...state,dept:'D',matrixSearch:'A'},options);
  assert.equal(sub.referenceN,full.referenceN);assert.equal(sub.excluded,1);
  for(const r of sub.rows){const original=full.rows.find(x=>x.geo===r.geo);assert.deepEqual(r,original);}
  assert.deepEqual(result,before);
});
test('empates no dependen del orden ni de desactivar una dimensión',()=>{
  const {models}=fixture(),c=C.contributions(models,state,{included:['impacto_humano']});
  const zero=c.rows.find(r=>r.geo==='B');assert.equal(zero.selectedLower,0);
  const again=C.contributions(models,state,{included:['impacto_humano','impacto_humano']});
  assert.deepEqual(again.rows,c.rows);
});
