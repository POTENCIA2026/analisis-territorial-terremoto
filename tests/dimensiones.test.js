const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../web/comparacion.js'),P=require('../web/priorizacion.js'),T=require('../web/modelo.js');
const state={date:'2026-09-28',scope:'all'};
function fixture(){
  const definitions=P.SECTORS.map(({id,name})=>({id,name}));
  const places=['a','b','c','d','e'].map((geo,i)=>({geo,m:geo,d:i<2?'D':'Otro',lv:'municipal'}));
  const values=[[10,100,0,50,0],[20,50,10,50,0],[30,0,0,50,0],[90,80,80,80,80],[70,70,70,70,70]];
  const models=Object.fromEntries(C.MODES.map((mode,mi)=>{
    const items=places.map((r,i)=>({...r,lower:40+i,upper:80,rank:i+1,
      sectors:definitions.map((s,j)=>({...s,lower:values[i][j]/(mi+1),upper:100,
        coverage:j===4||i===2&&j===2?0:j===3?.5:1}))}));
    const result={definitions,items,all:places,referenceN:5};
    return [mode,{compute:()=>result}];
  }));
  const rows=[0,1,2,4,4].map((i,k)=>({...places[i],date:state.date,f:T.RAPIDA,id:T.RECOVERY,
    u:'Índice',i:'Recuperación',v:[.2,.4,.6,.8,.9][k]})); // d lacks PNUD; e has conflicting reports
  return {models,territorial:T.create({rows})};
}
test('series separadas: X sectorial, Y PNUD idéntico, sin IPM ni peso global en X',()=>{
  const {models,territorial}=fixture();
  C.MODES.forEach((mode,mi)=>{
    const c=C.compareDimensions(models,territorial,state,{mode});
    assert.deepEqual(c.series[0].pairs.map(r=>r.x),[10,20,30].map(v=>v/(mi+1)));
    assert.deepEqual(c.series[0].pairs.map(r=>r.y),[.2,.4,.6]);
    assert.equal(c.comparison.excluded.rapida,2);
    for(const s of c.series)for(const pair of s.pairs){
      const original=c.comparison.pairs.find(r=>r.geo===pair.geo);
      assert.equal(pair.y,original.y);assert.equal(pair.lower,original.lower);
    }
  });
});
test('ceros documentados incluidos, faltantes excluidos y parciales identificados',()=>{
  const {models,territorial}=fixture(),c=C.compareDimensions(models,territorial,state);
  const salud=c.series.find(s=>s.id==='salud'),educacion=c.series.find(s=>s.id==='educacion');
  assert.deepEqual(salud.pairs.map(r=>r.geo),['a','b']);assert.equal(salud.pairs[0].x,0);
  assert.equal(salud.missing,1);assert.equal(salud.regression,null);
  assert.equal(educacion.partial,3);assert.equal(educacion.pairs[0].sectorCoverage,.5);
  const infra=c.series.find(s=>s.id==='infraestructura');
  assert.equal(infra.n,0);assert.equal(infra.missing,3);assert.equal(infra.regression,null);
});
test('cada dimensión tiene su propio ajuste, sin agrupar observaciones repetidas',()=>{
  const {models,territorial}=fixture(),c=C.compareDimensions(models,territorial,state);
  assert.equal(c.series[0].n,3);assert.ok(Math.abs(c.series[0].regression.r-1)<1e-12);
  assert.ok(Math.abs(c.series[1].regression.r+1)<1e-12);
  assert.equal(c.series[3].regression,null);assert.match(c.series[3].reason,/constante/);
  assert.equal(c.regression,undefined);
});
test('ocultar series y buscar no cambia pares, referencias, estadísticas ni modelo',()=>{
  const {models,territorial}=fixture(),before=structuredClone(models.absolute.compute());
  const all=C.compareDimensions(models,territorial,state);
  const sub=C.compareDimensions(models,territorial,{...state,matrixSearch:'no existe'},{included:['vivienda']});
  for(let i=0;i<all.series.length;i++){
    assert.deepEqual(sub.series[i].pairs,all.series[i].pairs);
    assert.deepEqual(sub.series[i].regression,all.series[i].regression);
    assert.equal(sub.series[i].visible,sub.series[i].id==='vivienda');
  }
  const dept=C.compareDimensions(models,territorial,{...state,dept:'D'});
  assert.deepEqual(dept.series[0].pairs,all.series[0].pairs.slice(0,2));
  assert.equal(dept.comparison.referenceN,all.comparison.referenceN);
  assert.equal(dept.series[0].regression,null);
  assert.deepEqual(models.absolute.compute(),before);
});
test('selección vacía, ámbitos sin pares y opciones inválidas se manejan explícitamente',()=>{
  const {models,territorial}=fixture();
  assert.ok(C.compareDimensions(models,territorial,state,{included:[]}).series.every(s=>!s.visible));
  assert.ok(C.compareDimensions(models,territorial,{...state,dept:'Sin datos'}).series.every(s=>s.n===0));
  assert.throws(()=>C.compareDimensions(models,territorial,state,{included:['incorrecta']}));
  assert.throws(()=>C.compareDimensions(models,territorial,state,{mode:'otro'}));
});
