/* Exploración descriptiva: disponibilidad de evidencia, sin modelo de priorización. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EducacionMunicipal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
  const number = v => Number.isFinite(v) ? v.toLocaleString('es-CO', {maximumFractionDigits: 1}) : 'Sin dato';
  const percentage = (v, digits = 1) => Number.isFinite(v) ? v.toLocaleString('es-CO', {maximumFractionDigits: digits}) + ' %' : 'Sin dato';
  const statusNames = {ready:'Disponible', partial:'Parcial', missing:'Sin dato'};
  const item = (label, status, note) => ({label, status, note});
  const pending = (label, note) => item(label, 'missing', note);
  function findMunicipalities(roster, query) {
    const terms = norm(query).split(/\s+/).filter(Boolean);
    return roster.filter(r => terms.every(t => norm(`${r.m} ${r.d} ${r.code}`).includes(t)));
  }
  function profile(data, code) {
    const men = data.educationInvestment?.municipalities?.find(r => r.code === code) || null;
    const ipm = data.baseline?.rows?.find(r => r.code === code) || null;
    const universe = data.educationUniverse?.municipalities?.find(r => r.code === code) || null;
    const coverage = data.educationUniverse?.coverage?.find(r => r.code === code) || null;
    const crosswalk = data.educationUniverse?.crosswalk?.find(r => r.code === code) || null;
    const year = data.educationUniverse?.source?.enrollment_year;
    const incompatible = universe ? `Hay matrícula municipal de ${year}; falta acreditar un corte compatible en el reporte de afectadas. No se dividen matrículas de periodos diferentes.` : 'Falta la matrícula total del municipio con un corte compatible.';
    const partial = (label, note, present = !!men) => item(label, present ? 'partial' : 'missing', present ? note : men ? 'El dato está incompleto o es inconsistente en el reporte.' : 'No hay registros de este municipio en el archivo MEN integrado.');
    const direct = (label, value, note) => item(label, Number.isFinite(value) ? 'ready' : 'missing', Number.isFinite(value) ? note : 'No hay un dato completo en las fuentes integradas.');
    const groups = [
      [direct('Sedes afectadas', men?.affected_sites, `${number(men?.affected_sites)} sedes con daño reportado; códigos DANE únicos.`),
       direct('Matrícula en sedes afectadas', men?.affected_enrollment, `${number(men?.affected_enrollment)} estudiantes matriculados en esas sedes. No equivale a estudiantes sin clase.`),
       item('% de matrícula municipal afectada', universe && men ? 'partial' : 'missing', incompatible),
       partial('Sedes con afectación severa o crítica', 'El MEN trae categorías de daño. Falta acordar cuáles corresponden a “severa o crítica”; aquí se muestran por separado.'),
       partial('% de estudiantes en sedes con daño severo', 'Hay matrícula por categoría de daño. Falta precisar “severo” y el universo de referencia.'),
       partial('% de sedes sin servicio presencial', 'Hay estado del servicio, estrategia y modalidad. “Presta servicio” no demuestra presencialidad completa.'),
       partial('% de estudiantes en modalidad temporal', 'Hay matrícula de la sede y modalidad reportada, pero no cuántos de sus estudiantes usan la solución temporal.')],
      [direct('IPM municipal', ipm?.v, `${percentage(ipm?.v)} · DANE censal ${ipm?.period || '2018'}. Es una línea base anterior al evento.`),
       direct('Ruralidad de la matrícula afectada', men?.rural_percent, `${number(men?.rural_enrollment)} / ${number(men?.affected_enrollment)} estudiantes = ${percentage(men?.rural_percent)}. Zona de la sede, no residencia del estudiante.`),
       direct('% de matrícula oficial municipal', universe?.official_percent, `${percentage(universe?.official_percent)} · MEN ${year}. Matrícula oficial / matrícula total del mismo año.`),
       item('% de matrícula oficial municipal afectada', universe && men ? 'partial' : 'missing', incompatible),
       item('Cobertura neta educativa previa', Number.isFinite(coverage?.net_coverage) ? (coverage.net_coverage > 100 ? 'partial' : 'ready') : 'missing', Number.isFinite(coverage?.net_coverage) ? `${percentage(coverage.net_coverage)} · MEN ${coverage.year}, total municipal. ${coverage.net_coverage > 100 ? 'El valor publicado supera 100 %; requiere revisar el denominador antes de usarlo en un índice.' : 'Se conserva como línea base de ese año.'}` : 'Falta integrar una fuente de cobertura neta municipal con año y nivel educativo.'),
       pending('% de matrícula de primera infancia afectada', 'El MEN tiene grados de preescolar; faltan el alcance de primera infancia y su matrícula municipal total comparable.'),
       partial('Pertenencia a PDET', 'El MEN tiene una etiqueta territorial conjunta; falta contrastarla con el listado oficial PDET.', !!men?.territory),
       partial('Pertenencia a ZOMAC', 'El MEN tiene una etiqueta territorial conjunta; falta contrastarla con el listado oficial ZOMAC.', !!men?.territory)],
      [pending('Sedes receptoras operativas', 'Falta identificar las sedes receptoras y verificar su funcionamiento.'),
       pending('Cupos disponibles', 'No hay inventario de cupos disponibles por sede receptora.'),
       pending('Transporte y accesibilidad', 'Faltan rutas, tiempos de viaje y disponibilidad de transporte.'),
       pending('Recursos para la recuperación', 'Faltan recursos humanos, físicos y financieros disponibles para recuperar el servicio.')],
      [pending('Proyectos y sedes beneficiarias', 'Falta un inventario de proyectos vinculado al municipio y a códigos DANE de sede.'),
       pending('Alcance de las intervenciones', 'Falta identificar qué necesidad atiende cada intervención.'),
       pending('Financiación confirmada', 'Faltan montos, fuentes y estado de confirmación de la financiación.'),
       pending('Avance de ejecución', 'Falta el avance físico o contractual por proyecto y su fecha de actualización.'),
       pending('Fecha prevista de entrega', 'Falta el cronograma de las intervenciones.')]
    ];
    const counts = groups.flat().reduce((acc, r) => {acc[r.status]++; return acc;}, {ready:0, partial:0, missing:0});
    return {men, ipm, universe, coverage, crosswalk, year, groups, counts};
  }
  function inventory(items) {
    const counts = items.reduce((a,r) => {a[r.status]++; return a;}, {ready:0,partial:0,missing:0});
    return `<details class="inv-inventory"><summary>Indicadores por encontrar <span>${counts.ready}/${items.length} disponibles</span></summary>
      <ul>${items.map(r => `<li><div><strong>${esc(r.label)}</strong><span class="inv-status ${r.status}">${statusNames[r.status]}</span></div><p>${esc(r.note)}</p></li>`).join('')}</ul></details>`;
  }
  function bars(rows, key, caption, unit, totalLabel = 'Total del reporte') {
    const known = rows.filter(r => Number.isFinite(r[key]));
    const sum = known.reduce((a,r) => a+r[key],0);
    return `<figure class="inv-chart"><figcaption>${esc(caption)}</figcaption><ul class="inv-bars">${rows.map(r => {
      const width = Number.isFinite(r[key]) && sum > 0 ? 100 * r[key] / sum : 0;
      return `<li><div><span>${esc(r.label)}</span><strong>${number(r[key])}</strong></div><div class="inv-track" aria-hidden="true"><i style="width:${width}%"></i></div></li>`;
    }).join('')}</ul><p class="small muted">${known.length === rows.length ? `${esc(totalLabel)}: ${number(sum)} ${esc(unit)}. Longitud de cada barra: proporción del total mostrado.` : 'Hay valores sin dato; no se calcula un total completo.'}</p></figure>`;
  }
  function noMen() {
    return '<div class="inv-empty">Sin registros municipales en el reporte MEN de sedes afectadas.<br><span>No significa que no existan sedes afectadas.</span></div>';
  }
  const educationTabs = [
    {id:'universe', label:'Oferta educativa'},
    {id:'damage', label:'Afectación'},
    {id:'context', label:'Contexto educativo'},
    {id:'recovery', label:'Recuperación'},
    {id:'projects', label:'Intervenciones'}
  ];
  function universeContent(p, measure) {
    if (!p.universe) return '<div class="inv-empty">Sin registros en la base nacional de matrícula integrada para este municipio.<br><span>No significa que no existan sedes educativas.</span></div>';
    const u = p.universe, c = p.crosswalk;
    const check = c ? `<p><strong>${number(c.matched)} de ${number(c.reported)}</strong> sedes del reporte de afectadas coinciden por código DANE, municipio y sector con la base ${esc(p.year)}.</p>${c.missing ? `<p>${number(c.missing)} no aparecen por código en esta base de matrícula.</p>` : ''}${c.municipality_conflict + c.sector_conflict ? `<p>${number(c.municipality_conflict + c.sector_conflict)} tienen diferencias de municipio o sector y requieren aclaración.</p>` : ''}` : '<p>Este municipio no aparece en el reporte de sedes afectadas integrado.</p>';
    return `<div class="inv-universe-stats"><div><span>Sedes con matrícula · ${esc(p.year)}</span><strong>${number(u.sites)}</strong></div><div><span>Matrícula total · ${esc(p.year)}</span><strong>${number(u.enrollment)}</strong></div></div>
      <div class="inv-measures" role="group" aria-label="Unidad de la oferta educativa"><button type="button" data-investment-measure="sites" aria-pressed="${measure==='sites'}">Sedes</button><button type="button" data-investment-measure="enrollment" aria-pressed="${measure==='enrollment'}">Matrícula</button></div>
      ${bars(u.sectors,measure,`Oferta por sector · MEN ${p.year}`,measure==='sites'?'sedes':'matrículas','Total municipal')}
      ${bars(u.zones,measure,`Oferta por zona de la sede · MEN ${p.year}`,measure==='sites'?'sedes':'matrículas','Total municipal')}
      <details class="inv-crosswalk"><summary>Correspondencia con el reporte de afectadas</summary>${check}<p class="small muted">Las sedes que no aparecen en el reporte de daños no se clasifican automáticamente como “sin afectación”. La coincidencia de códigos no demuestra que las matrículas de ambos archivos tengan el mismo corte.</p></details>
      <p class="note small">Incluye toda la matrícula publicada para ${esc(p.year)}, oficial y no oficial, en preescolar, básica y media. No acredita sedes sin matrícula ni cupos disponibles.</p>`;
  }
  function percentChart(label, value, note) {
    return `<figure class="inv-chart"><figcaption>${esc(label)} · escala de 0 a 100 %</figcaption><ul class="inv-bars inv-context"><li><div><span>${esc(label)}</span><strong>${percentage(value)}</strong></div><div class="inv-track ${Number.isFinite(value)?'':'missing'}" aria-hidden="true"><i style="width:${Number.isFinite(value)?Math.max(0,Math.min(100,value)):0}%"></i></div><p class="small muted">${esc(note)}</p></li></ul></figure>`;
  }
  function cardHeader(n, title, description) {
    return `<header><span class="inv-num">0${n}</span><div><h3>${esc(title)}</h3><p>${esc(description)}</p></div></header>`;
  }
  function renderCards(p, measure, educationTab = 'damage') {
    const {men,ipm,universe,coverage,groups} = p;
    const damageOrder = ['Colapso total','Colapso parcial','Riesgo inminente de colapso','Afectación parcial','Afectación menor','Sin afectación','Sin clasificación'];
    const damage = men ? bars([...men.damage].sort((a,b)=>damageOrder.indexOf(a.label)-damageOrder.indexOf(b.label)), measure,
      measure === 'sites' ? 'Sedes por categoría de daño del MEN' : 'Matrícula por categoría de daño del MEN', measure === 'sites' ? 'sedes' : 'estudiantes matriculados') : noMen();
    const educationalContext = (universe ? percentChart(`Matrícula oficial municipal · MEN ${p.year}`, universe.official_percent,
      `${number(universe.sectors[0].enrollment)} de ${number(universe.enrollment)} matrículas del municipio. Sectores oficial y no oficial del mismo año.`) : '') + (coverage ? `<div class="inv-coverage-value"><span>Cobertura neta total · MEN ${esc(coverage.year)}</span><strong>${percentage(coverage.net_coverage)}</strong><p class="small muted">${coverage.net_coverage > 100 ? 'El valor publicado supera 100 %. Se conserva sin recortarlo; revisar el denominador antes de usarlo en un índice.' : 'Valor municipal publicado por el MEN para ese año; no describe el periodo del reporte de daños.'}</p></div>` : '') + percentChart('Matrícula afectada en sedes rurales', men?.rural_percent,
      `${number(men?.rural_enrollment)} de ${number(men?.affected_enrollment)} estudiantes en sedes con daño reportado. Es ruralidad de la matrícula afectada, no de toda la población municipal.`);
    const territory = men?.territory ? ({no:'No',zomac:'ZOMAC','pdet-zomac':'PDET y ZOMAC',pdet:'PDET'}[men.territory]) : 'Sin dato';
    const vulnerability = percentChart(`IPM · DANE ${ipm?.period || '2018'}`, ipm?.v,
      'Porcentaje de población en pobreza multidimensional. Línea base anterior al evento.') +
      `<div class="inv-territory"><span class="small muted">Etiqueta PDET / ZOMAC en el MEN</span><strong>${esc(territory)}</strong><span class="inv-status ${men?.territory?'partial':'missing'}">${men?.territory?'Por contrastar':'Sin dato'}</span></div><p class="note small">Contexto común a los sectores. PDET y ZOMAC indican pertenencia territorial, no grados de afectación.</p>`;
    const strategy = men ? bars(men.strategy, 'sites', 'Cómo continúa el servicio · estrategia reportada', 'sedes') : noMen();
    const service = men ? `<p class="note small">Estado del servicio: ${men.service.map(r=>`${esc(r.label)}: ${number(r.sites)} sedes`).join(' · ')}. La estrategia describe la continuidad actual, pero no acredita cupos ni capacidad para recibir estudiantes.</p><details class="inv-modalities"><summary>Ver modalidades reportadas</summary><div class="table-scroll"><table><thead><tr><th>Modalidad</th><th>Sedes</th><th>Matrícula de esas sedes</th></tr></thead><tbody>${men.modality.map(r=>`<tr><td>${esc(r.label)}</td><td>${number(r.sites)}</td><td>${number(r.enrollment)}</td></tr>`).join('')}</tbody></table></div><p class="note small">La matrícula corresponde a la sede completa; no identifica cuántos estudiantes usan cada modalidad.</p></details>` : '';
    const projects = `<figure class="inv-chart"><figcaption>Información de intervenciones por incorporar</figcaption><ul class="inv-projects">${groups[3].map(r=>`<li><span>${esc(r.label)}</span><div class="inv-track missing" aria-hidden="true"></div><strong>Sin dato</strong></li>`).join('')}</ul></figure><p class="note">Todavía no hay un inventario de proyectos integrado para este municipio. Esto no significa que haya cero intervenciones.</p>`;
    const measures = `<div class="inv-measures" role="group" aria-label="Unidad del gráfico de daños"><button type="button" data-investment-measure="sites" aria-pressed="${measure==='sites'}">Sedes</button><button type="button" data-investment-measure="enrollment" aria-pressed="${measure==='enrollment'}">Matrícula</button></div>`;
    const content = {
      universe: universeContent(p, measure),
      damage: measures + damage + inventory(groups[0]),
      context: educationalContext + inventory(groups[1].slice(1,6)),
      recovery: '<h4>Capacidad de recuperación educativa</h4>' + strategy + service + inventory(groups[2]),
      projects: '<h4>Intervenciones en educación</h4>' + projects + inventory(groups[3])
    };
    const education = `<article class="card inv-card" data-investment-dimension="1" data-investment-sector="educacion">${cardHeader(1,'Educación','Todos los indicadores educativos del municipio')}
      <div class="inv-sector-tabs" role="tablist" aria-label="Indicadores de educación">${educationTabs.map(t=>`<button type="button" role="tab" id="investment-education-tab-${t.id}" data-investment-tab="${t.id}" aria-controls="investment-education-panel-${t.id}" aria-selected="${educationTab===t.id}" tabindex="${educationTab===t.id?0:-1}">${t.label}</button>`).join('')}</div>
      ${educationTabs.map(t=>`<section class="inv-sector-panel" role="tabpanel" id="investment-education-panel-${t.id}" aria-labelledby="investment-education-tab-${t.id}" tabindex="0" data-investment-panel="${t.id}" ${educationTab===t.id?'':'hidden'}>${content[t.id]}</section>`).join('')}</article>`;
    const territorial = `<article class="card inv-card" data-investment-dimension="2" data-investment-sector="vulnerabilidad">${cardHeader(2,'Vulnerabilidad territorial','Contexto transversal del municipio')}${vulnerability}${inventory([groups[1][0],...groups[1].slice(6)])}</article>`;
    const reserved = [{id:'vivienda',title:'Vivienda'},{id:'salud',title:'Salud'},{id:'infraestructura',title:'Infraestructura y acceso'}].map((s,i)=>
      `<article class="card inv-card inv-reserved" data-investment-dimension="${i+3}" data-investment-sector="${s.id}">${cardHeader(i+3,s.title,'Indicadores del municipio seleccionado')}<div class="inv-reserved-body"><span class="inv-status">Por desarrollar en esta vista</span><p>Espacio reservado para reunir los indicadores de afectación, capacidad de recuperación e intervenciones de ${esc(s.title.toLocaleLowerCase('es'))}.</p><p class="small muted">Los indicadores de este bloque todavía no forman parte del conteo de disponibilidad.</p></div></article>`).join('');
    return education + territorial + reserved;
  }
  function mount(data) {
    const $ = id => document.getElementById(id);
    if (!$('investment-picker')) return;
    const roster = [...(data.population?.rows || [])].sort((a,b)=>a.m.localeCompare(b.m,'es') || a.d.localeCompare(b.d,'es'));
    const input = $('investment-search'), dropdown = $('investment-dropdown'), options = $('investment-options');
    const toggle = $('investment-toggle');
    const listLabel = r => `${r.m} · ${r.d} · ${r.code}`;
    let selected = roster.find(r=>r.code==='66001') || roster[0], results = [], active = -1, measure = 'sites', educationTab = 'universe';
    if (!selected) { $('investment-heading').textContent = 'No se pudo cargar el catálogo municipal.'; input.disabled=true; toggle.disabled=true; return; }
    function paint() {
      const p = profile(data, selected.code);
      $('investment-heading').innerHTML = `<div><span class="kicker">Municipio seleccionado</span><h2>${esc(selected.m)} <span>· ${esc(selected.d)}</span></h2><p class="small muted">DANE ${esc(selected.code)} · ${p.universe ? `${number(p.universe.sites)} sedes en matrícula MEN ${esc(p.year)}` : 'Sin registros en la base nacional de matrícula'} · ${p.men ? `${number(p.men.reported_sites)} sedes oficiales en el reporte de afectadas` : 'Sin registros en el reporte de afectadas'}</p></div>
        <div class="inv-coverage"><span class="small muted">${p.groups.flat().length} indicadores revisados · Educación y contexto territorial</span><div><span class="inv-status ready">${p.counts.ready} ${p.counts.ready===1?'disponible':'disponibles'}</span><span class="inv-status partial">${p.counts.partial} ${p.counts.partial===1?'parcial':'parciales'}</span><span class="inv-status missing">${p.counts.missing} sin dato</span></div><p class="small muted">Describe la evidencia integrada, no la prioridad del municipio.</p></div><p class="inv-dates small muted">Fuentes: matrícula MEN ${esc(p.year || 'sin integrar')} · cobertura neta MEN ${esc(data.educationUniverse?.source?.coverage_year || 'sin integrar')} · reporte de afectadas del 21/09/2026 (fecha de matrícula no acreditada) · IPM censal 2018.</p>`;
      $('investment-cards').innerHTML = renderCards(p, measure, educationTab);
      $('investment-sources').innerHTML = `${data.educationUniverse ? `<p><strong>Oferta educativa nacional:</strong> <a href="https://www.datos.gov.co/d/ngw5-c5nw" target="_blank" rel="noopener">MEN · Matrícula en preescolar, básica y media</a>, año ${esc(data.educationUniverse.source.enrollment_year)}: ${number(data.educationUniverse.totals.sedes)} sedes con matrícula, ${number(data.educationUniverse.totals.matricula)} matrículas, ${number(data.educationUniverse.totals.municipios)} municipios. Incluye todos los registros publicados para ese año, agregados por sede; no solo las afectadas. <a href="data/men_abierto/sedes.json.gz" download>Descargar el detalle nacional por sede</a>. La ausencia de un municipio o sede no se interpreta como cero oferta.</p><p><strong>Cobertura neta:</strong> <a href="https://www.datos.gov.co/d/nudc-7mev" target="_blank" rel="noopener">MEN · Estadísticas educativas por municipio</a>, año ${esc(data.educationUniverse.source.coverage_year)}. Valores en puntos porcentuales tal como se publican; los superiores a 100 % se señalan para revisión. No se aplican tasas de otro año al reporte de daños.</p>` : ''}<p><strong>MEN · Afectación:</strong> <a href="data/men_sedes_escolares_afectadas_20260921.xlsx">Sedes escolares afectadas · Sheet1</a>. Archivo del 21 de septiembre de 2026 según su nombre; fecha de la matrícula no acreditada. Cruce por código DANE municipal (columna D); sedes únicas por código de sede (J).</p>
        <p>Daño: AP. Matrícula: AM. Zona: L. Etiqueta PDET/ZOMAC: AR. Estado, estrategia y modalidad del servicio: AX–AZ. Solo sedes oficiales reportadas; no representa toda la oferta educativa municipal ni prueba por sí solo la causa del daño.</p>
        <p><strong>IPM:</strong> <a href="${esc(data.baseline?.source?.download || '#investment-sources')}">DANE, información censal 2018</a>, IPM municipal total${p.ipm ? ` (${esc(p.ipm.locator)})` : ''}. Es contexto previo al evento.</p>
        <p><strong>Lista de trabajo:</strong> 21 indicadores se agrupan dentro de Educación y 3 en Vulnerabilidad territorial (IPM, PDET y ZOMAC). Son los mismos 24 campos revisados; vivienda, salud e infraestructura tienen espacios reservados y aún no se incluyen en ese conteo. “Disponible” permite mostrar el dato con su alcance y año; “Parcial” requiere aclarar el universo, una categoría o contrastar la fuente; “Sin dato” indica información aún no integrada. No se calculan puntajes ni se elige una metodología de priorización.</p>`;
    }
    function close(restore = false) {
      dropdown.hidden=true; input.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-expanded','false');
      input.removeAttribute('aria-activedescendant'); active=-1;
      if (restore) input.value=listLabel(selected);
    }
    function open(query = '') {
      const matches = findMunicipalities(roster,query); results = matches.slice(0,60); active=-1;
      options.innerHTML=results.map((r,i)=>`<div role="option" id="investment-option-${i}" data-investment-option="${i}" aria-selected="${r.code===selected.code}"><strong>${esc(r.m)}</strong><span>${esc(r.d)} · ${esc(r.code)}</span></div>`).join('');
      $('investment-search-status').textContent = matches.length ? `${matches.length} coincidencias${matches.length>60 ? ' · Se muestran las primeras 60; escribe para acotar.' : ''}` : 'No se encontraron municipios. Prueba otro nombre o código DANE.';
      dropdown.hidden=false; input.setAttribute('aria-expanded','true'); toggle.setAttribute('aria-expanded','true'); input.removeAttribute('aria-activedescendant');
    }
    function choose(index) {
      if (!results[index]) return;
      selected=results[index]; close(true); paint(); input.focus(); close(true);
    }
    input.addEventListener('focus',()=>{input.select(); open('');});
    input.addEventListener('click',()=>{if(dropdown.hidden)open('');});
    input.addEventListener('input',()=>open(input.value));
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close(true);return;}
      if(event.key==='Tab'){close(true);return;}
      if(event.key==='Enter' && !dropdown.hidden && active>=0){event.preventDefault();choose(active);return;}
      if(!['ArrowDown','ArrowUp'].includes(event.key))return;
      event.preventDefault(); if(dropdown.hidden)open(''); if(!results.length)return;
      active=active<0 ? (event.key==='ArrowDown'?0:results.length-1) : (active+(event.key==='ArrowDown'?1:-1)+results.length)%results.length;
      options.querySelectorAll('[role="option"]').forEach((el,i)=>el.classList.toggle('is-active',i===active));
      input.setAttribute('aria-activedescendant',`investment-option-${active}`);
      $('investment-option-'+active).scrollIntoView({block:'nearest'});
    });
    toggle.addEventListener('click',()=>{if(dropdown.hidden){input.focus();open('');}else close(true);});
    options.addEventListener('mousedown',e=>e.preventDefault());
    options.addEventListener('click',e=>{const el=e.target.closest('[data-investment-option]'); if(el)choose(Number(el.dataset.investmentOption));});
    document.addEventListener('click',e=>{if(!$('investment-picker').contains(e.target))close(true);});
    $('investment-picker').addEventListener('focusout',e=>{if(!$('investment-picker').contains(e.relatedTarget))close(true);});
    function selectEducationTab(key, focus = false) {
      if (!educationTabs.some(t=>t.id===key)) return;
      educationTab=key;
      $('investment-cards').querySelectorAll('[data-investment-tab]').forEach(button=>{
        const on=button.dataset.investmentTab===key;
        button.setAttribute('aria-selected',String(on)); button.tabIndex=on?0:-1;
        if(on && focus)button.focus();
      });
      $('investment-cards').querySelectorAll('[data-investment-panel]').forEach(panel=>{panel.hidden=panel.dataset.investmentPanel!==key;});
    }
    $('investment-cards').addEventListener('keydown',e=>{
      const tab=e.target.closest('[data-investment-tab]');
      if(!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();
      const current=educationTabs.findIndex(t=>t.id===tab.dataset.investmentTab);
      const next=e.key==='Home'?0:e.key==='End'?educationTabs.length-1:(current+(e.key==='ArrowRight'?1:-1)+educationTabs.length)%educationTabs.length;
      selectEducationTab(educationTabs[next].id,true);
    });
    $('investment-cards').addEventListener('click',e=>{
      const tab=e.target.closest('[data-investment-tab]');
      if(tab){selectEducationTab(tab.dataset.investmentTab);return;}
      const button=e.target.closest('[data-investment-measure]'); if(!button)return;
      measure=button.dataset.investmentMeasure; paint();
      document.querySelector(`[data-investment-panel="${educationTab}"] [data-investment-measure="${measure}"]`)?.focus();
    });
    input.value=listLabel(selected); paint();
  }
  return {findMunicipalities, profile, renderCards, mount};
});
