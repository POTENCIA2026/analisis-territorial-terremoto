/* Prioridad parcial: 35 % Afectación total + 25 % Vulnerabilidad; 40 % pendiente, sin renormalización. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PrioridadInversion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MODES={absolute:'Afectación total',percapita:'Afectación per cápita',sectorial:'Afectación relativa'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=v=>Number.isFinite(v)?new Intl.NumberFormat('es-CO',{maximumFractionDigits:2}).format(v):'Sin dato';
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
  const range=r=>r&&r.coverage>0?number(r.lower)+(Math.abs(r.upper-r.lower)>1e-8?'–'+number(r.upper):''):'Sin dato';
  const link=(label,url)=>/^https?:\/\//.test(url||'')?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`:esc(label);
  const WEIGHTS=Object.freeze({affectation:0.35,vulnerability:0.25,capacity:0.20,response:0.20});
  const EPS=1e-10;
  const SOTARA_SOURCE='https://microdatos.dane.gov.co/index.php/catalog/906/variable/F1/V780?name=Muni';
  function municipalJoin(row){
    if(/^\d{5}$/.test(String(row.code||'')))return {code:row.code,alias:false};
    // Única equivalencia nominativa autorizada: nombre + departamento, nunca nombre solo.
    const name=normalize(row.m).replace(/\s*[-–—]\s*/g,' ').replace(/\s+/g,' ').trim();
    if(!row.code&&normalize(row.d)==='cauca'&&['sotara paispamba','sotara'].includes(name))return {code:'19760',alias:true,source:SOTARA_SOURCE};
    return {code:row.code||'',alias:false};
  }
  const investmentRange=r=>r?.investment?.lower!==null&&Number.isFinite(r?.investment?.lower)?number(r.investment.lower)+(Math.abs(r.investment.upper-r.investment.lower)>EPS?'–'+number(r.investment.upper):''):'No calculable';
  function integrate(row,vulnerabilityModel){
    const join=municipalJoin(row),vulnerability=vulnerabilityModel?.get(join.code)||null;
    const v=Number.isFinite(vulnerability?.Vtercios)?vulnerability.Vtercios:null;
    const hasA=row.coverage>0&&Number.isFinite(row.lower)&&Number.isFinite(row.upper);
    const valid=hasA&&v!==null;
    const investment={
      lower:valid?WEIGHTS.affectation*row.lower+WEIGHTS.vulnerability*v:null,
      upper:valid?WEIGHTS.affectation*row.upper+WEIGHTS.vulnerability*v:null,
      affectationContributionLower:hasA?WEIGHTS.affectation*row.lower:null,
      affectationContributionUpper:hasA?WEIGHTS.affectation*row.upper:null,
      vulnerabilityScore:v,vulnerabilityContribution:v===null?null:WEIGHTS.vulnerability*v,
      vulnerabilityRecord:vulnerability,rank:null,maxSubtotal:60,
      join:join.alias?{method:'alias_validado_municipio_departamento',sourceCode:row.code||'',sourceMunicipality:row.m,code:join.code,source:join.source}:{method:'DIVIPOLA',code:join.code},
      capacity:null,response:null,finalScore:null,
      status:valid?'partial':v===null?'missing_vulnerability':'missing_affectation'
    };
    return {...row,code:join.code,investment};
  }
  function select(models,state,{selectedGeo='',query='',vulnerabilityModel=null}={}){
    // Solo Afectación total. La clasificación se calcula antes de filtrar departamento.
    const mode='absolute',result=models.absolute.compute({...state,dept:''});
    const joined=[...result.items,...result.missing].map(r=>integrate(r,vulnerabilityModel));
    // No sumar ni mezclar valores de A: conservar la única identidad con A documentada
    // y retirar únicamente su alias duplicado sin A, dentro de esta vista de Prioridad.
    const sotaraWithA=joined.filter(r=>r.code==='19760'&&r.coverage>0);
    const duplicates=sotaraWithA.length===1?joined.filter(r=>r.code==='19760'&&r.coverage<=0&&r.investment.join.method==='alias_validado_municipio_departamento'&&r.investment.join.sourceCode===''&&normalize(r.investment.join.sourceMunicipality)==='sotara'):[];
    const universe=joined.filter(r=>!duplicates.includes(r));
    const scored=universe.filter(r=>r.investment.lower!==null).sort((a,b)=>Math.abs(b.investment.lower-a.investment.lower)>EPS?b.investment.lower-a.investment.lower:a.m.localeCompare(b.m,'es')||a.code.localeCompare(b.code));
    let previous=null,rank=0;
    scored.forEach((r,i)=>{if(previous===null||Math.abs(r.investment.lower-previous)>EPS)rank=i+1;r.investment.rank=rank;previous=r.investment.lower;});
    const missing=universe.filter(r=>r.investment.lower===null).sort((a,b)=>a.m.localeCompare(b.m,'es')||a.d.localeCompare(b.d,'es'));
    const items=[...scored,...missing].filter(r=>!state.dept||r.d===state.dept),visibleScored=items.filter(r=>r.investment.lower!==null),top=visibleScored.slice(0,10),terms=normalize(query).split(/\s+/).filter(Boolean);
    const choices=items.filter(r=>terms.every(t=>normalize(`${r.m} ${r.d} ${r.code}`).includes(t))).sort((a,b)=>a.m.localeCompare(b.m,'es')||a.d.localeCompare(b.d,'es'));
    const selected=items.find(r=>r.geo===selectedGeo)||top[0]||items[0]||null;
    return {mode,state:{...state},items,top,choices,selected,scoredCount:visibleScored.length,missingCount:items.length-visibleScored.length,referenceN:result.referenceN-duplicates.length,sourceReferenceN:result.referenceN,consolidatedAliases:duplicates.length,referenceScoredCount:scored.length,weights:WEIGHTS};
  }
  function renderRanking(view){
    if(!view.top.length)return '<p class="empty">No hay municipios con subtotal A+V calculable en esta selección. Se requiere Afectación documentada y Vulnerabilidad comparable; los datos ausentes no se convierten en cero.</p>';
    return `<ol class="inv-rank-list">${view.top.map(r=>`<li><button type="button" class="inv-rank-row" data-investment-rank-geo="${esc(r.geo)}" aria-pressed="${r.geo===view.selected?.geo}" aria-label="${esc(`${r.m}, ${r.d}. Subtotal parcial A más V: ${investmentRange(r)} puntos del total de 100; máximo parcial 60. Ver ficha municipal.`)}"><span class="inv-rank-place"><span class="inv-rank-position">#${r.investment.rank}</span><span><strong>${esc(r.m)}</strong><small>${esc(r.d)}</small></span></span><span class="inv-rank-track" aria-hidden="true"><i class="inv-rank-upper" style="width:${r.investment.upper}%"></i><i class="inv-rank-lower" style="width:${r.investment.lower}%"></i></span><span class="inv-rank-value">${investmentRange(r)}</span></button></li>`).join('')}</ol>`;
  }
  function renderProfile(view,data){
    const r=view.selected;if(!r)return '<p class="empty">No hay municipios disponibles con estos filtros.</p>';
    const inv=r.investment,v=inv.vulnerabilityRecord,hasA=inv.affectationContributionLower!==null;
    const contribution=hasA?number(inv.affectationContributionLower)+(Math.abs(inv.affectationContributionUpper-inv.affectationContributionLower)>EPS?'–'+number(inv.affectationContributionUpper):''):'Sin dato';
    return `<header class="inv-rank-profile-head"><span class="kicker">Municipio seleccionado</span><h3>${esc(r.m)} <span>· ${esc(r.d)}</span></h3><p class="small muted">DIVIPOLA ${esc(r.code||'sin código')} · afectación: captura ${esc(view.state.date)} · vulnerabilidad: CNPV 2018</p>${inv.join.method==='alias_validado_municipio_departamento'?`<p class="small muted">Enlace territorial validado: ${link('Sotará Paispamba, Cauca · DANE 19760',inv.join.source)}. Alias sin A consolidado; no se alteran los puntajes de A.</p>`:''}</header>
      <div class="inv-partial-summary"><span>Subtotal parcial A + V</span><strong>${investmentRange(r)}${inv.lower!==null?' <small>/ 100</small>':''}</strong><p>${inv.lower!==null?`Máximo parcial: 60 puntos · puesto ${inv.rank} del universo territorial`:'Sin subtotal: '+(inv.status==='missing_vulnerability'?'falta Vulnerabilidad comparable.':'falta Afectación documentada.')}</p><span class="inv-partial-pending">Índice final pendiente · capacidad y respuesta no integradas (40 %)</span></div>
      <div class="inv-rank-context inv-av-context"><div><span>Afectación total · peso 35 %</span><strong>${range(r)}${hasA?' /100':''}</strong><small>Aporte al subtotal: <b>${contribution}</b> puntos</small><small>Cobertura de A: ${number(100*r.coverage)} % · sin ajuste IPM</small></div><div><span>Vulnerabilidad · peso 25 %</span><strong>${inv.vulnerabilityScore===null?'Sin dato':number(inv.vulnerabilityScore)+' /100'}</strong><small>Aporte al subtotal: <b>${inv.vulnerabilityContribution===null?'Sin dato':number(inv.vulnerabilityContribution)}</b> puntos</small><small>IPM, ruralidad y dependencia: ⅓ cada uno</small><small>Percentiles nacionales fijos · 1.101 municipios</small></div></div>
      <details class="inv-av-method"><summary>Fórmula y componentes del subtotal</summary><p class="formula">Subtotal A+V = 0,35 × Afectación total + 0,25 × Vulnerabilidad<br>V = (pIPM + pRuralidad + pDependencia) / 3</p>${inv.lower!==null?`<p class="small">Límite documentado: 0,35 × ${number(r.lower)} + 0,25 × ${number(inv.vulnerabilityScore)} = ${number(inv.lower)}.<br>Límite por faltantes de A: 0,35 × ${number(r.upper)} + 0,25 × ${number(inv.vulnerabilityScore)} = ${number(inv.upper)}. Se calcula sin redondear.</p>`:'<p class="small">No se calcula un subtotal si falta Vulnerabilidad comparable o no hay Afectación documentada. No se imputa cero.</p>'}${inv.vulnerabilityScore!==null?`<p class="small">Percentiles de V: IPM ${number(v.pIPM)} · ruralidad ${number(v.pRuralidad)} · dependencia ${number(v.pDependencia)}. La referencia nacional no cambia al filtrar.</p>`:''}<p class="small">Pesos externos del documento metodológico: A 35 % y V 25 %. No se dividen por 0,60 ni se redistribuye el 40 % pendiente. El intervalo representa solo faltantes de A: no es un intervalo del índice final.</p></details>
      <h4 class="inv-rank-sector-title">Afectación por temática</h4><p class="small muted">Puntajes existentes de A, sin modificación. Selecciona una temática para ver su cálculo.</p>
      <div class="inv-rank-sectors">${r.sectors.map(s=>`<button type="button" class="inv-rank-sector" data-investment-sector-detail="${esc(s.id)}" aria-label="${esc(`Ver cálculo de ${s.name} en ${r.m}`)}"><span><strong>${esc(s.name)}</strong><small>Respuesta: sin información integrada</small></span><span class="inv-rank-sector-score">${range(s)}${s.coverage>0?' <small>/100</small>':''}<small>${s.coverage>0?(s.coverage<1-1e-8?'Información parcial':'Con datos sectoriales'):'Pendiente de datos'}</small></span><span class="inv-rank-arrow" aria-hidden="true">›</span></button>`).join('')}</div>
      <div class="inv-rank-pending"><strong>40 % pendiente · no es el índice final</strong><ul><li>Capacidad fiscal e institucional · 20 %: sin puntaje integrado.</li><li>Respuesta e intervenciones · 20 %: sin puntaje integrado; no implica ausencia de respuesta.</li></ul><p>Estos componentes permanecen sin dato. No se suman ceros ni se usan IDF o proyectos para completar el índice.</p></div>`;
  }
  function renderSectorDetail(row,sector,data,state,mode){
    if(!row||!sector)return '<p class="empty">No hay una temática seleccionada.</p>';
    const fields=sector.fields.map(f=>{
      const source=f.row?.f||f.source,sourceInfo=data.sources?.[source],original=f.row?`${number(f.row.v)} ${f.row.u||f.unit||''}`:'Sin dato';
      const denominator=f.denominator?`${number(f.denominator.value)} ${f.denominator.unit||''} · ${f.denominator.reference_date||f.denominator.year||'fecha no acreditada'}`:'Sin denominador compatible';
      return `<tr><th scope="row">${esc(f.label)}<small>${link(sourceInfo?.label||source,sourceInfo?.url)}${f.row?.source_date?' · '+esc(f.row.source_date):''}</small>${f.note?`<small>${esc(f.note)}</small>`:''}</th><td>${esc(original)}</td><td>${f.share===0?'Solo consulta':number(f.score)}</td><td>${number(f.share*100)} %</td><td>${f.share===0?'0':f.score==null?'Desconocido':number(f.score*f.share)}</td></tr>${mode!=='absolute'?`<tr class="inv-rank-base"><td colspan="5">Base: ${esc(f.denominatorLabel||'no disponible')} · ${esc(denominator)}. ${link(f.denominatorSource?.label||'Fuente del denominador',f.denominatorSource?.url)}${f.reason?' · '+esc(f.reason):''}</td></tr>`:''}`;
    }).join('');
    return `<p>${esc(row.m)}, ${esc(row.d)} · ${esc(MODES[mode])} · captura ${esc(state.date)}.</p><p class="inv-rank-detail-score">${esc(sector.name)}: <strong>${range(sector)}${sector.coverage>0?' /100':''}</strong></p><p class="small muted">La captura es la fecha de incorporación al tablero; no acredita la fecha del hecho ni de cada reporte original.</p><div class="table-scroll"><table><thead><tr><th>Indicador y fuente</th><th>Valor original</th><th>Puntaje existente</th><th>Peso interno</th><th>Aporte al sector</th></tr></thead><tbody>${fields}</tbody></table></div>${sector.coverage>0?'':'<p>Sin observaciones sectoriales comparables. Los límites siguientes son matemáticos, no valores observados.</p>'}<p class="formula">Sector = suma de puntajes existentes × peso interno.<br>Límite documentado: ${number(sector.lower)} · límite posible por faltantes: ${number(sector.upper)}.<br>Peso del sector en Afectación: 1/${row.sectors.length}. Aporte: ${number(sector.lower/row.sectors.length)}–${number(sector.upper/row.sectors.length)} puntos.</p><p>Sin ajuste IPM. Se conservan la normalización, los denominadores y los límites del modelo de Afectación.</p><div class="inv-rank-pending"><strong>Respuesta: sin información integrada</strong><p>Falta un inventario verificable de intervenciones, cobertura y avance. No se asigna un puntaje de respuesta ni se interpreta el faltante como cero.</p></div>`;
  }
  function mount(data,models,{getState,onSelect=()=>{},document:doc=globalThis.document}={}){
    const $=id=>doc.getElementById(id);if(!$('inv-ranking-list'))return null;
    const mode='absolute';
    let selectedGeo='',view=null,signature='',lastTrigger=null,vulnerabilityModel=null;
    function close(){const dialog=$('inv-rank-dialog');if(dialog.open)dialog.close();}
    function paint(state=getState()){
      const next=JSON.stringify([state.scope,state.dept,state.date]);
      if(next!==signature){signature=next;close();}
      view=select(models,state,{selectedGeo,vulnerabilityModel});selectedGeo=view.selected?.geo||'';
      $('inv-ranking-list').innerHTML=renderRanking(view);
      $('inv-rank-detail').innerHTML=renderProfile(view,data);
      $('inv-rank-count').textContent=`${view.top.length} de ${view.scoredCount} municipios con subtotal · ${view.missingCount} registros sin subtotal calculable. Puestos entre ${view.referenceScoredCount} calculables; ${view.referenceN} registros territoriales del ámbito.${view.consolidatedAliases?' 1 alias duplicado sin A consolidado.':''}`;
      $('inv-rank-note').textContent=`A total 35 % + V 25 % · ${state.dept||'Todos los departamentos del ámbito'} · captura A ${state.date}. Orden por límite documentado del subtotal. Empates comparten puesto; orden visual por nombre.`;
      const chooser=$('inv-rank-municipality');chooser.innerHTML='<option value="">'+(view.choices.length?'Selecciona un municipio ('+view.choices.length+')':'Sin coincidencias')+'</option>'+view.choices.map(r=>`<option value="${esc(r.geo)}">${esc(r.m+' · '+r.d+' · '+(r.code||''))}${r.investment.lower!==null?'':' · sin subtotal'}</option>`).join('');chooser.value=view.choices.some(r=>r.geo===selectedGeo)?selectedGeo:'';
      $('inv-rank-exploration').hidden=!view.selected;
      onSelect(view.selected);
      return view;
    }
    function selectMunicipality(geo){if(!view?.items.some(r=>r.geo===geo))return false;selectedGeo=geo;close();paint();return true;}
    $('inv-rank-municipality').addEventListener('change',()=>selectMunicipality($('inv-rank-municipality').value));
    $('inv-ranking-list').addEventListener('click',event=>{const b=event.target.closest('[data-investment-rank-geo]');if(b){const geo=b.dataset.investmentRankGeo;selectMunicipality(geo);[...$('inv-ranking-list').querySelectorAll('[data-investment-rank-geo]')].find(el=>el.dataset.investmentRankGeo===geo)?.focus({preventScroll:true});}});
    $('inv-rank-detail').addEventListener('click',event=>{
      const b=event.target.closest('[data-investment-sector-detail]');if(!b)return;
      const sector=view.selected?.sectors.find(s=>s.id===b.dataset.investmentSectorDetail);if(!sector)return;
      lastTrigger=b;$('inv-rank-dialog-title').textContent=sector.name+' · '+view.selected.m;
      $('inv-rank-dialog-body').innerHTML=renderSectorDetail(view.selected,sector,data,view.state,mode);
      if(!$('inv-rank-dialog').open)$('inv-rank-dialog').showModal();
    });
    $('inv-rank-dialog-close').addEventListener('click',close);
    $('inv-rank-dialog').addEventListener('close',()=>{if(lastTrigger?.isConnected)lastTrigger.focus();lastTrigger=null;});
    function setVulnerabilityModel(value){vulnerabilityModel=value;selectedGeo='';signature='';return paint();}
    return {render:paint,selectMunicipality,getSelection:()=>view,setVulnerabilityModel};
  }
  return {MODES,WEIGHTS,integrate,select,renderRanking,renderProfile,renderSectorDetail,mount};
});
