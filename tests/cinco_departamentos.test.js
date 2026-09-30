const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../web/modelo.js'),P=require('../web/priorizacion.js');
const population=require('../data/poblacion_relativa.json');
const date='2026-09-28',state={scope:'simat5',date};
const row=(code,d,m,v=1)=>({code,d,m,geo:'municipal:'+code,lv:'municipal',date,id:'pnud_cedu',i:'Centros educativos',f:'PNUD',u:'Número',dim:'Educación',v});
const fixture=()=>({population,dates:[date],rows:[row('66001','Risaralda','Pereira'),row('05001','Antioquia','Medellín',100)],healthPressure:{enabled:false,source_cascade:{enabled:true}}});
test('cinco departamentos: 126 municipios sin requerir un indicador educativo nuevo',()=>{
 const d=fixture(),model=T.create(d),rows=model.visible(state),codes=new Set(rows.map(r=>r.code));
 assert.equal(codes.size,126);assert.equal(rows.length,126);assert.ok(!codes.has('05001'));
 assert.deepEqual(Object.fromEntries([...new Set(rows.map(r=>r.d))].sort().map(dept=>[dept,rows.filter(r=>r.d===dept).length])),
   {'Caldas':27,'Chocó':31,'Quindío':12,'Risaralda':14,'Valle del Cauca':42});
 const p=P.models(d).absolute.compute(state);
 assert.equal(p.referenceN,126);assert.equal(p.items.length,1);assert.equal(p.missing.length,125);
 assert.equal(p.definitions.find(s=>s.id==='educacion').fields.length,1);
 assert.equal(p.definitions.flatMap(s=>s.fields).some(f=>f.id==='men_matricula_critica'),false);
});
test('el filtro por departamento conserva el universo y las referencias',()=>{
 const d=fixture(),t=T.create(d),p=P.models(d).absolute;
 assert.equal(t.visible({...state,dept:'Caldas'}).length,27);
 assert.equal(t.visible({...state,dept:'Antioquia'}).length,0);
 assert.equal(p.compute({...state,dept:'Risaralda'}),p.compute(state));
 assert.equal(t.visible({...state,dept:'Caldas'},date,true).length,126);
});
test('no se amplían los universos anteriores por incluir la referencia municipal',()=>{
 const d=fixture(),t=T.create(d);
 assert.equal(t.visible({...state,scope:'all'}).length,2);
 assert.equal(P.models(d).absolute.compute({...state,scope:'all'}).referenceN,2);
 assert.equal(t.visible({...state,scope:'decree'}).length,0);
});
test('referencias de población repetidas entre años no duplican municipios',()=>{
 const d=fixture();d.population={rows:[...population.rows,...population.rows.map(r=>({...r,year:2025}))]};
 assert.equal(new Set(T.create(d).visible(state).map(r=>r.geo)).size,126);
});
test('el nombre público no contiene SIMAT',()=>{
 assert.equal(T.scopeLabel('simat5'),'cinco departamentos');
 const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../web/tablero.html'),'utf8');
 assert.ok(html.includes('<option value="simat5">Cinco departamentos</option>'));
 assert.ok(!html.includes('Cinco departamentos SIMAT'));
});
