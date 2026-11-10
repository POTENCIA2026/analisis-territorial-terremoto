const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../web/inversion_educativa.js');
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname,'../data',f),'utf8'));
const data = {educationInvestment:load('inversion_educativa.json'), baseline:load('linea_base_priorizacion.json')};
test('municipality search ignores accents and disambiguates department and code',()=>{
  const roster=[{code:'1',m:'San José',d:'Caldas'},{code:'2',m:'San José',d:'Cauca'}];
  assert.equal(E.findMunicipalities(roster,'jose caldas')[0].code,'1');
  assert.equal(E.findMunicipalities(roster,'2')[0].d,'Cauca');
  assert.deepEqual(E.findMunicipalities(roster,'xyz'),[]);
});
test('Pereira uses affected rural enrollment, and classifies membership as unverified',()=>{
  const p=E.profile(data,'66001');
  assert.equal(p.men.affected_sites,167);
  assert.equal(p.ipm.v,15.1);
  assert.deepEqual(p.counts,{ready:4,partial:6,missing:14});
  assert.equal(p.groups[1][1].status,'ready');
  assert.equal(p.groups[1][6].status,'partial');
  assert.match(E.renderCards(p,'enrollment'),/Matrícula por categoría/);
});
test('absence from MEN keeps baseline and never implies zero damage',()=>{
  const d={...data,educationInvestment:{municipalities:[]}};
  const p=E.profile(d,'66001');
  assert.equal(p.men,null);
  assert.equal(p.counts.ready,1);
  assert.equal(p.groups[0][0].status,'missing');
  const html=E.renderCards(p,'sites');
  assert.match(html,/Sin registros municipales/);
  assert.match(html,/15,1 %/);
  assert.doesNotMatch(html,/width:NaN|undefined/);
});
test('missing IPM and missing payload do not become zero percent',()=>{
  const p=E.profile({},'00000');
  assert.equal(p.counts.ready,0);
  assert.equal(p.counts.missing,24);
  assert.doesNotMatch(E.renderCards(p,'sites'),/>0 %</);
});
test('zero is a valid observation, while unknown rurality stays missing',()=>{
  const p=E.profile({educationInvestment:{municipalities:[{code:'x',affected_sites:0,affected_enrollment:0,rural_percent:null}]}},'x');
  assert.equal(p.groups[0][0].status,'ready');
  assert.equal(p.groups[1][1].status,'missing');
});

test('national MEN adds official share but never divides enrollment across incompatible periods',()=>{
  const full={...data,educationUniverse:load('men_universo.json')};
  const p=E.profile(full,'66001');
  assert.equal(p.universe.sites,319);
  assert.equal(p.universe.enrollment,82902);
  assert.equal(p.crosswalk.matched,167);
  assert.equal(p.groups[1][2].status,'ready');
  assert.equal(p.groups[0][2].status,'partial');
  assert.equal(p.groups[1][3].status,'partial');
  assert.match(p.groups[0][2].note,/No se dividen/);
  assert.equal(p.coverage.net_coverage,102.45);
  assert.equal(p.groups[1][4].status,'partial');
  const html=E.renderCards(p,'enrollment','universe');
  assert.match(html,/Oferta por sector · MEN 2025/);
  assert.match(html,/61\.947/);
  assert.match(html,/20\.955/);
  assert.match(html,/102,5 %/);
  assert.doesNotMatch(html,/width:NaN|undefined/);
});

test('national offer remains available without an affected report and missing municipality is not zero',()=>{
  const full={...data,educationInvestment:{municipalities:[]},educationUniverse:load('men_universo.json')};
  const p=E.profile(full,'66001');
  assert.equal(p.men,null);
  assert.equal(p.groups[0][2].status,'missing');
  assert.match(E.renderCards(p,'sites','universe'),/319/);
  const missing=E.profile(full,'97777');
  assert.equal(missing.universe,null);
  assert.match(E.renderCards(missing,'sites','universe'),/No significa que no existan sedes educativas/);
});
