const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../web/proyectos.js');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'..','data',name),'utf8'));
const torre=read('proyectos_torre_control.json'),gtrt=read('proyectos_gtrt.json');
const shown=projects=>projects.filter(p=>p.origin!=='alianza'&&P.review(p)==='confirmed').map(P.normalizeProject);

test('«Por confirmar» es una temática con color propio y distinto',()=>{
  assert.equal(P.canonicalTheme('por confirmar'),'Por confirmar');
  const colors=Object.values(P.themeColors);
  assert.equal(new Set(colors).size,colors.length);
  assert.match(P.themeColor('Por confirmar'),/^#[0-9a-f]{6}$/);
});

test('las tarjetas de SECOP no cambian: sin organización ni etiqueta de financiación',()=>{
  for(const p of shown(torre.projects)){
    const card=P.renderCard(p);
    assert.ok(!card.includes('Organización:'));
    assert.equal((card.match(/<span>/g)||[]).length,2,p.id);
  }
});

test('una iniciativa del GTRT usa la misma tarjeta, con organización y financiación',()=>{
  const p=shown(gtrt.projects).find(x=>x.funding==='Por financiar'),card=P.renderCard(p);
  for(const piece of ['<span>Tercero</span>','<span>Confirmado</span>','<span>Por financiar</span>','Organización: '+P.esc(p.organization),
    '<p>Por confirmar</p>','Valor reportado del proyecto</dt><dd>Por confirmar','Beneficiarios reportados</dt><dd>Por confirmar','Ver fuente','Referencia: '+p.id])
    assert.ok(card.includes(piece),piece);
  assert.ok(!card.includes('Ver ficha'));
  assert.ok(!card.includes('Referencia local de captura'));
});

test('el resumen solo suma pesos reportados: ni «Por confirmar» ni dólares',()=>{
  assert.equal(P.reportedPesos({valueText:'Por confirmar'}),null);
  assert.equal(P.reportedPesos({valueText:'US$ 25.000 (reportado en dólares)'}),null);
  assert.equal(P.reportedPesos({valueText:'$ 80.300.000'}),80300000);
  const before=P.summaryStats(shown(torre.projects)),after=P.summaryStats(shown([...torre.projects,...gtrt.projects]));
  const funded=shown(gtrt.projects).filter(p=>P.reportedPesos(p)!==null);
  assert.ok(funded.length>0&&funded.every(p=>p.funding==='Financiada'));
  assert.equal(after.third,before.third+shown(gtrt.projects).length);
  assert.equal(after.thirdWithValue,before.thirdWithValue+funded.length);
  assert.equal(after.thirdPesos,before.thirdPesos+funded.reduce((n,p)=>n+P.reportedPesos(p),0));
  assert.equal(after.repeatedRecords,before.repeatedRecords);
});

test('solo se muestran las iniciativas validadas por su organización',()=>{
  const visible=shown(gtrt.projects);
  assert.equal(visible.length,gtrt.coverage.validated);
  assert.ok(visible.length<gtrt.projects.length);
  assert.ok(visible.every(p=>p.review==='confirmed'));
});

test('el gráfico y los filtros aceptan las dos fuentes juntas',()=>{
  const all=shown([...torre.projects,...gtrt.projects]);
  assert.equal(new Set(all.map(p=>p.id)).size,all.length);
  const chart=P.renderChart(all);
  assert.ok(chart.includes('Por confirmar'));
  assert.ok(P.renderChart(all,'Chocó').includes('Municipios de Chocó'));
  const onlyPending=P.select(all,{mission:'Por confirmar'});
  assert.equal(onlyPending.length,shown(gtrt.projects).length);
  assert.equal(P.select(all,{mission:'Salud'}).length,P.select(shown(torre.projects),{mission:'Salud'}).length);
});


test('el tablero publicado contiene 152 fichas y ninguna referencia repetida',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const snapshot=JSON.parse(html.match(/const PROJECTS_DATA=([^\r\n]+);/)[1]);
  const visible=shown(snapshot.projects);
  assert.equal(visible.length,152);
  assert.equal(P.duplicates(visible).size,0);
  assert.equal(snapshot.deduplication.removedRecords,5);
  assert.equal(visible.filter(p=>p.id.startsWith('gtrt-')).length,129);
  const before=P.summaryStats(shown([...torre.projects,...gtrt.projects]));
  const after=P.summaryStats(visible);
  assert.equal(after.thirdPesos,before.thirdPesos-16300000000);
  assert.equal(after.thirdWithValue,before.thirdWithValue-7);
});

test('los dos montos en conflicto quedan fuera del total y sus variantes son consultables',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const snapshot=JSON.parse(html.match(/const PROJECTS_DATA=([^\r\n]+);/)[1]);
  const conflicts=shown(snapshot.projects).filter(p=>p.valueConflict);
  assert.equal(conflicts.length,2);
  for(const p of conflicts){
    assert.equal(P.reportedPesos(p),null);
    const card=P.renderCard(p);
    assert.ok(card.includes('excluido del total'));
    assert.ok(card.includes('Se cuenta una sola vez'));
    for(const row of p.deduplicatedRecords){
      assert.ok(card.includes(P.esc(row.id)));
      assert.ok(card.includes(P.esc(row.valueText)));
    }
  }
});
