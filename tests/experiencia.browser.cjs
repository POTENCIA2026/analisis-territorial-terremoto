// Vista resumen, navegación fija y móvil. Ejecutar después de generar index.html.
// Requiere Playwright; CHROME_PATH es opcional.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})}),errors=[];
 const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
 async function open(width,height){const p=await browser.newPage({viewport:{width,height}});p.on('pageerror',e=>errors.push(e.message));await p.goto(url,{waitUntil:'load',timeout:120000});await p.waitForSelector('#matrix tbody tr');return p;}

 const desktop=await open(1440,900);
 assert.equal(await desktop.locator('.profile-card').evaluate(e=>e.classList.contains('is-compact')),true,'la vista resumen es la predeterminada');
 const row=await desktop.locator('#matrix tbody tr').first().evaluate(e=>e.getBoundingClientRect().height);
 assert.ok(row<130,'una fila resumen debe ser corta, no '+row+'px');
 assert.equal(await desktop.locator('#matrix').evaluate(e=>e.scrollWidth>e.clientWidth),false,'los sectores caben sin scroll horizontal');
 assert.match(await desktop.locator('#matrix tbody tr').first().locator('td').first().innerText(),/Puesto global: \d+ \d+ de \d+/,'rango y cobertura no se pegan');

 await desktop.click('[data-density="detail"]');
 assert.ok(await desktop.locator('#matrix tbody tr').first().evaluate(e=>e.getBoundingClientRect().height)>250,'el detalle conserva las tarjetas de indicadores');
 assert.match(await desktop.locator('#matrix tbody tr').first().innerText(),/Familias afectadas/);
 await desktop.reload({waitUntil:'load'});await desktop.waitForSelector('#matrix tbody tr');
 assert.equal(await desktop.locator('.profile-card').evaluate(e=>e.classList.contains('is-compact')),false,'la elección de vista se recuerda');
 await desktop.click('[data-density="compact"]');

 // Buscar y abrir la ficha siguen funcionando en la vista resumen.
 await desktop.locator('#matrix-search').fill('Pereira');
 assert.equal(await desktop.locator('#matrix tbody tr').count(),1);
 await desktop.locator('#matrix .municipality-name').click();
 assert.equal(await desktop.locator('#priority-detail').isVisible(),true);
 await desktop.locator('#matrix-search').fill('');

 // La barra de pestañas queda fija y cambiar de pestaña no deja la lectura a mitad de página.
 await desktop.evaluate(()=>window.scrollTo(0,1600));
 assert.equal(Math.round(await desktop.locator('.tab-nav').evaluate(e=>e.getBoundingClientRect().top)),0,'la barra de pestañas queda fija arriba');
 await desktop.click('#tab-radar');
 await desktop.waitForTimeout(400);
 const panelTop=await desktop.locator('#radar').evaluate(e=>e.getBoundingClientRect().top);
 assert.ok(panelTop>=0&&panelTop<200,'el panel nuevo empieza a la vista, no '+panelTop);

 const mobile=await open(390,844);
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'sin scroll horizontal de página en móvil');
 const filters=await mobile.locator('.filters.global label').evaluateAll(l=>l.map(e=>Math.round(e.getBoundingClientRect().top)));
 assert.equal(filters[1],filters[2],'departamento y fecha comparten fila en móvil');
 assert.equal(await mobile.locator('#matrix .municipal-cell').first().evaluate(e=>getComputedStyle(e).position),'sticky','el nombre queda fijo al desplazar en horizontal');
 await mobile.click('#tab-metodo');await mobile.waitForTimeout(700);
 const tab=await mobile.locator('#tab-metodo').evaluate(e=>{const b=e.getBoundingClientRect(),n=e.parentElement.getBoundingClientRect();return b.left>=n.left-1&&b.right<=n.right+1;});
 assert.equal(tab,true,'la pestaña activa queda visible en la barra móvil');

 // Modo oscuro (sigue al sistema, como Torre de Control): fondo, texto, gráficos y radar.
 const darkCtx=await browser.newContext({viewport:{width:1440,height:900},colorScheme:'dark'}),dark=await darkCtx.newPage();
 dark.on('pageerror',e=>errors.push(e.message));await dark.goto(url,{waitUntil:'load',timeout:120000});await dark.waitForSelector('#matrix tbody tr');
 assert.equal(await dark.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(32, 82, 101)','fondo de página de Torre en oscuro');
 assert.equal(await dark.evaluate(()=>getComputedStyle(document.body).color),'rgb(255, 255, 255)');
 assert.equal(await dark.evaluate(()=>getComputedStyle(document.querySelector('.profile-card')).backgroundColor),'rgb(56, 100, 117)','las tarjetas usan la superficie oscura');
 assert.equal(await dark.evaluate(()=>getComputedStyle(document.querySelector('.brandbar')).backgroundColor),'rgb(1, 58, 81)','la barra de marca mantiene el azul marino');
 await dark.click('#tab-radar');await dark.waitForSelector('#radar-chart svg text');
 const label=await dark.locator('#radar-chart svg text').first().evaluate(e=>getComputedStyle(e).fill);
 assert.notEqual(label,'rgb(0, 0, 0)','las etiquetas del radar no quedan en negro sobre fondo oscuro');
 const series=await dark.locator('#radar-chart svg line, #radar-chart svg polygon[stroke]').evaluateAll(n=>n.map(e=>e.getAttribute('stroke')).filter(Boolean));
 assert.ok(series.length&&series.every(c=>c!=='#0061a7'&&c!=='#c92b00'),'las series del radar usan los tonos claros del modo oscuro');
 // Al cambiar el tema del sistema, los gráficos se redibujan con la otra paleta.
 await dark.emulateMedia({colorScheme:'light'});await dark.waitForTimeout(600);
 const lightSeries=await dark.locator('#radar-chart svg line, #radar-chart svg polygon[stroke]').evaluateAll(n=>n.map(e=>e.getAttribute('stroke')).filter(Boolean));
 assert.ok(lightSeries.some(c=>c==='#0061a7'),'al pasar a claro, el radar se redibuja con su paleta clara');
 await darkCtx.close();

 assert.deepEqual(errors,[]);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
