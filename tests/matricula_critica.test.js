const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../web/priorizacion.js'),T=require('../web/modelo.js'),E=require('../web/matricula_critica.js');
const source=require('../data/matricula_critica.json');
const date='2026-09-28',state={scope:'all',date};
const school=(code,value)=>({geo:'municipal:'+code,code,lv:'municipal',m:code,d:code.startsWith('66')?'Risaralda':'Antioquia',
  id:'pnud_cedu',f:'PNUD',u:'Número',v:value,i:'Centros educativos',dim:'Educación',date});
function fixture(){
  return {rows:[school('66001',10),school('66170',5),school('66075',0)],dates:[date],latest:date,
    baseline:{rows:[]},population:{rows:[{code:'66001',year:2026,population:100000},{code:'66170',year:2026,population:10000},{code:'66075',year:2026,population:5000}]},
    healthPressure:{enabled:false,source_cascade:{enabled:true}},
    educationCritical:{enabled:true,report_date:'2026-09-21',roster:[{code:'66001',d:'Risaralda',m:'Pereira'},{code:'66170',d:'Risaralda',m:'Dosquebradas'},{code:'66075',d:'Risaralda',m:'Balboa'}],
      municipalities:[{code:'66001',reported_sites:10,critical_enrollment:1000},{code:'66170',reported_sites:5,critical_enrollment:0}]}};
}
const sector=(result,code='66001')=>result.all.find(r=>r.code===code).sectors.find(s=>s.id==='educacion');
test('añade matrícula, conserva centros y el peso total de Educación',()=>{
  const d=fixture(),result=P.models(d).absolute.compute(state),s=sector(result);
  assert.deepEqual(s.fields.map(f=>[f.id,f.share]),[['pnud_cedu',.5],[E.ID,.5]]);
  assert.equal(s.lower,100);assert.equal(result.definitions.length,5);
  assert.equal(sector(result,'66170').lower,25);
  assert.equal(sector(result,'66075').coverage,.5);
  assert.equal(sector(result,'66075').upper,50);
});
test('las cuatro dimensiones restantes permanecen idénticas en los tres modelos',()=>{
  const d=fixture(),old=structuredClone(d);delete old.educationCritical;
  for(const mode of ['absolute','percapita','sectorial']){
    const a=P.models(d)[mode].compute(state),b=P.models(old)[mode].compute(state);
    for(const r of a.all)for(const s of r.sectors.filter(s=>s.id!=='educacion'))
      assert.deepEqual(s,b.all.find(x=>x.geo===r.geo).sectors.find(x=>x.id===s.id));
  }
});
test('per cápita y relativo usan población: 1000 estudiantes / 100000 habitantes × 10000 = 100',()=>{
  for(const mode of ['percapita','sectorial']){
    const f=sector(P.models(fixture())[mode].compute(state)).fields[1];
    assert.equal(f.row.v,1000);assert.equal(f.rate,100);assert.equal(f.denominator.value,100000);
    assert.equal(f.anchor,100);assert.equal(f.score,100);assert.equal(f.normalization,undefined);
    assert.equal(f.relativeUnit,'/10.000 hab.');
  }
});
test('faltantes, ceros y población inválida no se confunden',()=>{
  const d=fixture();d.educationCritical.municipalities[0].critical_enrollment=null;
  assert.equal(sector(P.models(d).absolute.compute(state)).fields[1].score,null);
  assert.equal(sector(P.models(d).absolute.compute(state),'66170').fields[1].score,0);
  for(const population of [[],[{code:'66170',year:2025,population:500}], [{code:'66170',year:2026,population:0}],
    [{code:'66170',year:2026,population:500},{code:'66170',year:2026,population:500}]]){
    const x=fixture();x.population.rows=population;
    assert.equal(sector(P.models(x).sectorial.compute(state),'66170').fields[1].score,null);
  }
});
test('no se lleva el reporte MEN a capturas anteriores al 21 de septiembre',()=>{
  const d=fixture();d.rows.forEach(r=>r.date='2026-09-20');
  const f=sector(P.models(d).absolute.compute({...state,date:'2026-09-20'})).fields[1];
  assert.equal(f.row,null);assert.equal(f.score,null);
  assert.equal(sector(P.models(fixture()).absolute.compute(state)).fields[1].row.source_date,'2026-09-21');
});
test('buscar y filtrar departamento no recalibra el nuevo indicador',()=>{
  const m=P.models(fixture()).sectorial,a=m.compute(state);
  assert.equal(m.compute({...state,dept:'Risaralda',matrixSearch:'Pereira'}),a);
});
test('ámbito nuevo restringido al padrón y sin excluir municipios sin daños',()=>{
  const d=fixture();d.rows=[school('66001',10),school('05001',999)];
  const t=T.create(d),s={...state,scope:E.SCOPE},r=P.models(d).absolute.compute(s);
  assert.equal(r.referenceN,3);
  assert.deepEqual(r.all.map(x=>x.code).sort(),['66001','66075','66170']);
  assert.equal(sector(r,'66075').coverage,0);
  assert.equal(t.visible({...s,dept:'Risaralda'}).length,3);
  assert.equal(t.visible({...s,dept:'Antioquia'}).length,0);
  assert.equal(t.inScope(school('05001',0),s),false);
  assert.equal(P.models(d).absolute.compute(state).referenceN,2); // otros ámbitos intactos
});
test('archivo real: 126 municipios únicos en 5 departamentos, 121 con MEN',()=>{
  assert.equal(source.roster.length,126);assert.equal(new Set(source.roster.map(r=>r.code)).size,126);
  assert.deepEqual(source.department_counts,{'Caldas':27,'Chocó':31,'Quindío':12,'Risaralda':14,'Valle del Cauca':42});
  assert.equal(source.totals.scope_with_men,121);assert.equal(source.totals.men_sites,5537);
  assert.equal(source.totals.critical_sites,1010);assert.equal(source.totals.critical_enrollment,187505);
  assert.equal(source.municipalities.length,434);
});
test('archivo real: ejemplos recalculados desde MEN, no matrícula SIMAT',()=>{
  const find=c=>source.municipalities.find(r=>r.code===c)?.critical_enrollment;
  assert.equal(find('66001'),23859);assert.equal(find('27050'),774);assert.equal(find('66170'),2435);
  assert.equal(find('76020'),12);assert.equal(find('76828'),1276);assert.equal(find('76001'),0);
  assert.equal(find('27660'),undefined);
  const model=E.create({educationCritical:source});
  assert.equal(model.rows([{code:'27660'}],date).length,0);
});
test('sin cascada se conserva la proporción histórica entre fuentes',()=>{
  const d=fixture();d.healthPressure.source_cascade.enabled=false;
  assert.deepEqual(sector(P.models(d).absolute.compute(state)).fields.map(f=>f.share),[.25,.25,.5]);
});
test('el resumen reconoce la nueva evidencia MEN, no la mera pertenencia al padrón',()=>{
  const U=require('../web/presentacion.js'),d=fixture();d.rows=[];
  const s={...state,scope:E.SCOPE},a=P.models(d).absolute.selection(s),summary=U.summary(d,a,a,s);
  assert.equal(summary.affected,1);assert.equal(summary.departments,1);
  assert.equal(summary.population.value,100000);
});
