const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  assert.deepEqual(await page.locator('[data-tab]').allTextContents(),['Índice','Comparar municipios','Necesidad de recuperación temprana','Diagnóstico territorial','Fuentes y método']);
  assert.equal(await page.locator('.matrix-card').count(),3);
  const ids=await page.locator('[id]').evaluateAll(xs=>xs.map(x=>x.id));assert.equal(ids.length,new Set(ids).size);
  const abs=await page.locator('#matrix').textContent(),rel=await page.locator('#relative-matrix').textContent();
  await page.selectOption('#affectation-mode','percapita');
  const normal=await page.locator('#percapita-matrix tbody').textContent();
  const th=page.locator('#percapita-matrix [data-relative-sort="salud"]');
  await th.click();assert.equal(await th.locator('..').getAttribute('aria-sort'),'descending');
  await th.click();assert.equal(await th.locator('..').getAttribute('aria-sort'),'ascending');
  await th.click();assert.equal(await page.locator('#percapita-matrix tbody').textContent(),normal);
  await page.locator('#matrix-search').fill('pereira');
  assert.equal(await page.locator('#percapita-matrix tbody tr').count(),1);
  await page.locator('#percapita-matrix [data-relative-geo]').click();
  assert.match(await page.locator('#percapita-detail').innerText(),/cálculo per cápita/);
  assert.match(await page.locator('#percapita-detail').innerText(),/Habitantes/);
  await page.locator('#percapita-close').click();
  await page.locator('#matrix-search').fill('');
  assert.equal(await page.locator('#matrix').textContent(),abs);assert.equal(await page.locator('#relative-matrix').textContent(),rel);
  await page.locator('#tab-radar').click();
  assert.equal(await page.locator('#radar .radar-layout').count(),3);
  await page.locator('#radar-search-0').fill('pereira');
  assert.equal(await page.locator('#radar-results-0').getAttribute('class'),'radar-results');
  assert.equal(await page.locator('#radar-results-0 button').evaluate(el=>getComputedStyle(el).display),'block');
  await page.locator('#radar-search-0').press('ArrowDown');await page.keyboard.press('Enter');
  await page.locator('#radar-percapita-sectors [data-radar-m="0"][data-radar-axis="2"]').focus();
  assert.match(await page.locator('#radar-percapita-inspector').innerText(),/10.000 habitantes/);
  assert.match(await page.locator('#radar-percapita-inspector').innerText(),/Tasa =/);
  assert.match(await page.locator('#radar-legend').innerText(),/Pereira/);
  assert.match(await page.locator('#radar-relative-legend').innerText(),/Pereira/);
  await page.locator('#tab-rapida').click();
  assert.equal(await page.locator('#rapida #matrix, #priority-trend').count(),0);
  assert.ok(await page.locator('#scatter circle').count()>0);
  assert.equal(await page.locator('#comparison-axis, #comparison-panel, #comparison-warning').count(),0);
  assert.equal(await page.locator('#comparison-card .comparison-controls select, #comparison-card .comparison-controls input').count(),2);
  assert.deepEqual(await page.locator('#comparison-mode option').allTextContents(),['Absoluto','Per cápita','Relativo']);
  const checkPairs=async()=>{
    const expected=await page.evaluate(()=>Comparacion.compare(priorityModels,model,state,{mode:document.getElementById('comparison-mode').value,axis:'value',panel:'available'}).pairs.map(r=>r.geo).sort());
    assert.deepEqual(await page.locator('[data-compare-geo]').evaluateAll(xs=>xs.map(x=>x.dataset.compareGeo).sort()),expected);
    assert.match(await page.locator('#comparison-chart').innerText(),/Puntaje de necesidad/);
    const coefficients=await page.evaluate(()=>{
     const c=Comparacion.compare(priorityModels,model,state,{mode:document.getElementById('comparison-mode').value,axis:'value',panel:'available'});
     const n=x=>x==null?'—':new Intl.NumberFormat('es-CO',{maximumFractionDigits:4}).format(x);
     return [String(c.n),c.regression?new Intl.NumberFormat('es-CO',{style:'percent',maximumFractionDigits:2}).format(c.regression.r2):'—',n(c.regression?.r),n(c.rho)];
    });
    assert.deepEqual(await page.locator('#comparison-kpis .tile-value').allTextContents(),coefficients);
    assert.deepEqual(await page.locator('#comparison-kpis .tile-label').allTextContents(),['Pares comparables','Qué tan bien se ajustan los índices — R²','Cómo se relacionan los puntajes — Pearson r','Qué tanto coincide el orden — Spearman ρ']);
  };
  await checkPairs();
  const valueCheck=await page.evaluate(()=>{
    const c=Comparacion.compare(priorityModels,model,state,{mode:'absolute',axis:'value',panel:'available'});
    return c.pairs.every(r=>r.y===r.recovery);
  });
  assert.equal(valueCheck,true);
  const decreePairs=await page.locator('[data-compare-geo]').count();
  const initial=await page.locator('#comparison-kpis').innerText();
  await page.locator('#comparison-mode').selectOption('percapita');
  assert.notEqual(await page.locator('#comparison-kpis').innerText(),initial);
  await checkPairs();
  await page.locator('#comparison-mode').selectOption('sectorial');
  await checkPairs();
  const stats=await page.locator('#comparison-kpis').innerText();
  await page.locator('#comparison-search').fill('pereira');
  assert.equal(await page.locator('.comparison-point.highlight').count(),1);
  assert.equal(await page.locator('#comparison-kpis').innerText(),stats);
  await page.locator('.comparison-point.highlight').focus();
  assert.match(await page.locator('#comparison-detail').innerText(),/Pereira/);
  assert.match(await page.locator('#comparison-detail').innerText(),/Cobertura:/);

  await page.locator('#comparison-mode').selectOption('absolute');
  await checkPairs();
  await page.locator('#scope').selectOption('all');
  await checkPairs();
  assert.ok(await page.locator('[data-compare-geo]').count()>=decreePairs);
  assert.equal(await page.locator('#comparison-mode').inputValue(),'absolute');
  await page.locator('#dept').selectOption('Risaralda');
  await checkPairs();
  assert.ok(await page.locator('[data-compare-geo]').count()<decreePairs);
  assert.match(await page.locator('#comparison-note').innerText(),/Risaralda/);
  await page.locator('#dept').selectOption('');
  await checkPairs();
  assert.doesNotMatch(await page.locator('body').innerText(),/recuperación RAPIDA/i);
  await page.locator('#rapida-search').fill('pereira');
  assert.equal(await page.locator('#rapida-table tbody tr').count(),1);
  if(process.env.UNIFIED_SCREENSHOT)await page.locator('#comparison-card').screenshot({path:process.env.UNIFIED_SCREENSHOT});
  assert.doesNotMatch(await page.locator('#matrix-search').getAttribute('placeholder'),/lorica/i);
  const unchangedModels=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Comparacion.MODES.map(mode=>[mode,priorityModels[mode].compute(state).items.map(r=>[r.geo,r.lower,r.upper,r.rank])]))));
  await page.locator('#comparison-target').selectOption('dimensions');
  assert.equal(await page.locator('#comparison-external').isVisible(),false);
  assert.equal(await page.locator('#dimension-effect').isVisible(),true);
  assert.equal(await page.locator('#dimension-options input:checked').count(),5);
  assert.equal(await page.locator('#dimension-table tbody tr').count(),1); // previous search preserved
  const checkContributions=async()=>{
    const expected=await page.evaluate(()=>{
      const c=Comparacion.contributions(priorityModels,state,{mode:document.getElementById('comparison-mode').value,included:[...document.querySelectorAll('#dimension-options input:checked')].map(el=>el.value)});
      return c.rows.filter(r=>Territorial.searchMatch({...r,lv:'municipal'},document.getElementById('comparison-search').value)).sort((a,b)=>(a.selectedRank??Infinity)-(b.selectedRank??Infinity)||a.rank-b.rank).map(r=>({geo:r.geo,full:fmt(r.lower),selected:r.selectedKnown?fmt(r.selectedLower):'Sin dato',removed:fmt(r.removed),rank:String(r.selectedRank??'—')}));
    });
    const actual=await page.locator('#dimension-table tbody tr').evaluateAll(trs=>trs.map(tr=>({geo:tr.querySelector('button').dataset.dimensionGeo,full:tr.cells[1].textContent,selected:tr.cells[2].textContent,removed:tr.cells[3].textContent,rank:tr.cells[5].textContent})));
    assert.deepEqual(actual,expected);
  };
  await checkContributions();
  await page.locator('#dimension-options input[value="vivienda"]').uncheck();
  await checkContributions();
  assert.match(await page.locator('#dimension-detail').innerText(),/Vivienda · excluida/);
  for(const mode of ['percapita','sectorial','absolute']){
    await page.locator('#comparison-mode').selectOption(mode);await checkContributions();
    assert.equal(await page.locator('#dimension-options input:checked').count(),4);
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Comparacion.MODES.map(mode=>[mode,priorityModels[mode].compute(state).items.map(r=>[r.geo,r.lower,r.upper,r.rank])])))),unchangedModels);
  await page.locator('#scope').selectOption('simat5');
  await page.locator('#comparison-search').fill('');await checkContributions();
  await page.locator('#dept').selectOption('Risaralda');await checkContributions();
  await page.locator('#comparison-search').fill('no-existe');
  assert.match(await page.locator('#dimension-bars').innerText(),/No hay municipios/);
  await page.locator('#comparison-search').fill('pereira');
  for(const cb of await page.locator('#dimension-options input').all())await cb.uncheck();
  assert.match(await page.locator('#dimension-bars').innerText(),/Selecciona al menos/);
  assert.equal(await page.locator('#dimension-table tbody tr').count(),0);
  await page.locator('#dimension-reset').click();await checkContributions();
  assert.equal(await page.locator('#dimension-options input:checked').count(),5);
  await page.locator('#dimension-method-open').click();
  assert.equal(await page.locator('#dimension-method-dialog').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dimension-method-dialog').isVisible(),false);
  if(process.env.DIMENSION_SCREENSHOT)await page.locator('#comparison-card').screenshot({path:process.env.DIMENSION_SCREENSHOT});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow aporte de dimensiones');
  if(process.env.DIMENSION_MOBILE_SCREENSHOT)await page.locator('#comparison-card').screenshot({path:process.env.DIMENSION_MOBILE_SCREENSHOT});
  await page.locator('#comparison-target').selectOption('pnud');
  await checkPairs();
  for(const tab of ['rapida','radar','prioridades','diagnostico','metodo']){
    await page.locator('#tab-'+tab).click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+tab);
  }
  await page.locator('#tab-rapida').click();
  await page.locator('#comparison-detail [data-geo]').click();
  assert.equal(await page.locator('#diagnostico').isVisible(),true);
  assert.match(await page.locator('#profile-note').innerText(),/Pereira/);
  assert.deepEqual(errors,[]);
  console.log('Unified UI OK: matrices/radars unchanged, RAPIDA, comparison, exact dimension contributions in 3 modes, subset ranks, filters, empty/missing cases, reset, modal, keyboard, mobile, diagnostic.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
