const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href,{timeout:120000});
  await page.locator('#matrix tbody tr').first().waitFor();
  for(const id of ['matrix','percapita-matrix','relative-matrix']){
   assert.equal(await page.locator('#'+id+' thead th').count(),6);
   assert.doesNotMatch(await page.locator('#'+id+' thead').innerText(),/comunitari/i);
  }
  await page.locator('#relative-search').fill('atrato');
  const atrato=page.locator('#relative-matrix tbody tr').filter({has:page.getByRole('button',{name:'Atrato',exact:true})});
  assert.equal(await atrato.count(),1);
  assert.match(await atrato.locator('td').nth(3).innerText(),/Base: 3 Sedes IPS/);
  assert.match(await atrato.locator('td').nth(4).innerText(),/Sedes educativas · 2022/);
  assert.match(await page.locator('#relative-note').innerText(),/SIMAT, 2022/);
  const header=page.locator('#relative-matrix [data-relative-sort="salud"]');
  for(const expected of ['descending','ascending','none']){
   await header.click();assert.equal(await header.locator('..').getAttribute('aria-sort'),expected);
  }
  await page.locator('#tab-radar').click();
  for(const prefix of ['radar','radar-percapita','radar-relative']){
   await page.locator('#'+prefix+'-search-0').fill('atrato');
   await page.locator('#'+prefix+'-results-0 button').filter({hasText:/^Atrato, Chocó/}).click();
   assert.equal(await page.locator('#'+prefix+'-select-0').inputValue(),'municipal:27050');
   assert.equal(await page.locator('#'+prefix+'-sectors [data-radar-m="0"]').count(),5);
   assert.equal(await page.locator('#'+prefix+'-chart polygon').first().evaluate(e=>e.points.numberOfItems),5);
   const points=await page.locator('#'+prefix+'-chart polygon').first().evaluate(e=>Array.from(e.points,p=>[p.x,p.y]));
   const distances=points.map(p=>Math.hypot(p[0]-330,p[1]-270));
   assert.ok(Math.max(...distances)-Math.min(...distances)<.001,'Pentágono regular');
  }
  await page.locator('#radar-relative-sectors [data-radar-m="0"][data-radar-axis="2"]').click();
  assert.match(await page.locator('#radar-relative-inspector').innerText(),/3 Sedes IPS/);
  assert.match(await page.locator('#radar-relative-inspector').innerText(),/no porcentaje/);
  await page.locator('#radar-relative-sectors [data-radar-m="0"][data-radar-axis="3"]').click();
  assert.match(await page.locator('#radar-relative-inspector').innerText(),/MEN\/SIMAT 2022/);
  for(const scope of ['all','decree']){
   await page.locator('#scope').selectOption(scope);
   assert.equal(await page.locator('#radar-relative-select-0').inputValue(),'municipal:27050');
  }
  await page.locator('#tab-rapida').click();
  for(const mode of ['absolute','percapita','sectorial']){
   await page.locator('#comparison-mode').selectOption(mode);
   assert.ok(await page.locator('#comparison-chart svg').count());
   assert.doesNotMatch(await page.locator('#comparison-kpis').innerText(),/NaN|undefined/);
  }
  for(const tab of ['diagnostico','metodo']){
   await page.locator('#tab-'+tab).click();assert.equal(await page.locator('#'+tab).isVisible(),true);
  }
  await page.locator('#tab-radar').click();
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sin desbordamiento móvil');
  assert.deepEqual(errors,[]);
  console.log('Navegador OK: tres matrices, tres radares pentagonales, REPS/SIMAT, orden, ámbitos, dispersión y pestañas conservadas.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
