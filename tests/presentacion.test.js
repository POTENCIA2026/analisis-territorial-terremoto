const test=require('node:test'),assert=require('node:assert/strict'),V=require('../web/presentacion.js');
const state={date:'2026-09-18'},place=(geo,population=100)=>({geo,d:'D',m:geo,population:{population},coverage:1,lower:1});
const row=(geo,id,v,f='3iS-Sheets')=>({geo,lv:'municipal',date:state.date,id,v,f});
test('el resumen cuenta afectaciones, no registros de inventario ni pobreza',()=>{
 const items=[place('a'),place('b'),place('c'),place('d')];
 const s=V.summary({rows:[row('a','3is_fallecidos',1),row('a','pnud_va',2,'PNUD'),row('b','3is_fallecidos',0),row('c','ipm',70,'DANE'),row('d','gravedad_oficial',100,'Naboo/UNGRD')]},{items},{items},state);
 assert.equal(s.affected,2);assert.equal(s.departments,1);assert.equal(s.population.value,200);assert.equal(s.critical,1);assert.equal(s.classified,1);
});
test('no clasificación es ausencia, y población faltante se señala como parcial',()=>{
 const items=[place('a',null),place('b',0)];
 const s=V.summary({rows:[row('a','pnud_va',5,'PNUD'),row('b','gravedad_oficial',0,'Naboo/UNGRD')]},{items},{items},state);
 assert.equal(s.critical,null);assert.equal(s.population.value,null);assert.equal(s.population.known,0);assert.equal(s.population.total,1);
});
test('respeta captura y ámbito, incluye empates sin sumar población duplicada',()=>{
 const items=Array.from({length:22},(_,i)=>({...place(String(i)),lower:i<19?30-i:5}));
 const s=V.summary({rows:[row('outside','3is_heridos',20),{...row('0','3is_fallecidos',1),date:'2026-09-17'},row('1','3is_fallecidos',1)]},{items},{items},state);
 assert.equal(s.affected,1);assert.equal(s.topN,22);assert.equal(s.priorityPopulation.value,2200);
});
test('cero y faltante distintos, familias informativas permanecen y se escapan etiquetas',()=>{
 const s={lower:0,upper:100,coverage:.5,fields:[{label:'Familias afectadas <script>',source:'3iS-Sheets',row:{v:0,u:'Número'},share:0,score:0},{label:'Desaparecidos',source:'3iS-Sheets',row:null,share:.5,score:null}]};
 const html=V.sector(s,false);
 assert.match(html,/Solo consulta/);assert.match(html,/<b>0<\/b>/);assert.match(html,/sin dato/);assert.ok(!html.includes('Número'));assert.ok(!html.includes('Documentado'));assert.ok(!html.includes('posible'));assert.ok(!html.includes('<script>'));
 assert.match(V.sector({...s,coverage:0},false),/<strong>Sin dato<\/strong>/);
});
test('la celda municipal conserva puntaje global aun ordenando por una dimensión',()=>{
 const html=V.municipality({geo:'a',m:'A',d:'D',coverage:1,lower:25,rank:3,available:8,fieldCount:9},'data-priority-geo');
 assert.match(html,/25<small> \/100/);assert.match(html,/Puesto global: 3/);assert.match(html,/8 de 9/);
});
test('si falta el denominador, el conteo conocido sigue visible sin fabricar una tasa',()=>{
 const html=V.sector({lower:0,coverage:0,fields:[{label:'Familias afectadas',row:{v:42000},source:'3iS-Sheets',share:0,rate:null,score:null}]},true);
 assert.match(html,/sin dato relativo/);assert.match(html,/Reportado: 42.000/);assert.match(html,/<strong>Sin dato<\/strong>/);
});
