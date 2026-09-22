/* Presentación pública. No transforma datos ni interviene en el modelo del índice. */
(function(root){
  'use strict';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(n,digits=2)=>Number.isFinite(n)?new Intl.NumberFormat('es-CO',{maximumFractionDigits:digits}).format(n):'—';
  const source=s=>String(s||'').replaceAll('3iS-Sheets','3iS');
  function municipality(r,attribute){
    return '<td class="municipal-cell"><button class="link municipality-name" type="button" '+attribute+'="'+esc(r.geo)+'">'+esc(r.m)+'</button><div class="muted small">'+esc(r.d)+'</div>'+
      '<div class="score-label">Puntaje de afectación</div><div class="priority-number">'+(r.coverage>0?number(r.lower):'—')+'<small> /100</small></div>'+
      '<div class="rank-label">Puesto global: '+(r.rank??'—')+'</div><div class="small muted">'+r.available+' de '+r.fieldCount+' indicadores con información</div></td>';
  }
  function field(f,relative){
    const has=relative?f.rate!=null:!!f.row;
    const value=has?number(relative?f.rate:f.row.v,relative?4:2):'—';
    const unit=relative?f.relativeUnit:(f.row?.u==='Número'?'':f.row?.u);
    const explanation=f.share===0?'Solo consulta; no suma al índice.':has?'Puntaje de la variable: '+number(f.score)+'/100.':'Sin dato; no equivale a cero.';
    const title=[f.label,explanation,relative&&f.row?'Valor original: '+number(f.row.v):'',relative&&f.denominator?'Base: '+number(f.denominator.value)+' '+f.denominator.unit+' · '+f.denominator.reference_date:'',f.reason||''].filter(Boolean).join('. ');
    const base=relative&&has&&f.denominator?'<small class="rate-base">'+number(f.row.v)+' / '+number(f.denominator.value)+' '+esc(f.denominator.unit.toLowerCase())+'</small>':relative&&f.row?'<small class="rate-base">Reportado: '+number(f.row.v)+'</small>':'';
    return '<span class="heat-item '+(has?'':'missing')+'" title="'+esc(title)+'" style="--intensity:'+ (f.score==null?0:Math.min(100,Math.max(0,f.score)))+'"><span class="field-name">'+esc(f.label.replace(/ · (3iS|PNUD)$/,''))+'</span><span class="field-value"><b>'+value+'</b>'+ (has&&unit?' <small>'+esc(unit)+'</small>':has?'':relative&&f.row?' <small>sin dato relativo</small>':' <small>sin dato</small>')+'</span>'+base+'</span>';
  }
  function sector(s,relative,selected=false){
    const sources=[...new Set(s.fields.filter(f=>f.row).map(f=>source(f.source)))];
    const bases=relative?[...new Set(s.fields.filter(f=>f.denominator).map(f=>source(f.denominatorSource?.label)).filter(Boolean))]:[];
    return '<td class="heat-cell '+(selected?'selected-sector':'')+'"><div class="sector-block sector-score"><span class="block-label">Puntaje</span><strong>'+(s.coverage>0?number(s.lower)+' <small>/100</small>':'Sin dato')+'</strong></div>'+
      '<div class="sector-block sector-result"><span class="block-label">Resultado</span>'+s.fields.map(f=>field(f,relative)).join('')+'</div>'+
      '<div class="sector-block sector-evidence"><span class="block-label">Evidencia</span>'+esc(sources.join(' · ')||'Sin reporte')+(bases.length?'<details><summary>Base de comparación</summary><span>'+esc(bases.join(' · '))+'</span></details>':'')+'</div></td>';
  }
  function summary(data,absolute,selected,state){
    // Resumen independiente de la búsqueda y del orden de columnas. Un reporte cero
    // no convierte un municipio en afectado; el IPM o los costos tampoco lo hacen.
    const ids=new Set(['3is_familias','3is_fallecidos','3is_desaparecidos','3is_heridos','3is_vivdestruidas','3is_vivaveriadas','3is_salud','3is_educativos','3is_colapsos','3is_acueductos','3is_vias','pnud_vd','pnud_va','pnud_csalud','pnud_cedu']);
    const places=new Map(absolute.items.map(r=>[r.geo,r]));
    const rows=data.rows.filter(r=>r.date===state.date&&r.lv==='municipal'&&places.has(r.geo));
    const gravity=rows.filter(r=>r.f==='Naboo/UNGRD'&&r.id==='gravedad_oficial');
    const affected=new Set(rows.filter(r=>r.v>0&&ids.has(r.id)&&['PNUD','3iS-Sheets'].includes(r.f)).map(r=>r.geo));
    gravity.filter(r=>r.v>0).forEach(r=>affected.add(r.geo));
    function population(geos){
      const observed=[...geos].map(geo=>places.get(geo)?.population?.population).filter(n=>Number.isFinite(n)&&n>0);
      return {value:observed.length?observed.reduce((a,b)=>a+b,0):null,known:observed.length,total:geos.size};
    }
    const ranked=selected.items.filter(r=>r.coverage>0).slice().sort((a,b)=>b.lower-a.lower);
    const cutoff=ranked[Math.min(19,ranked.length-1)]?.lower;
    const top=new Set(ranked.filter(r=>r.lower>=cutoff).map(r=>r.geo));
    const critical=new Set(gravity.filter(r=>r.v===100).map(r=>r.geo));
    const classified=new Set(gravity.filter(r=>r.v>0).map(r=>r.geo));
    return {affected:affected.size,departments:new Set([...affected].map(g=>places.get(g).d)).size,
      population:population(affected),priorityPopulation:population(top),topN:top.size,
      critical:classified.size?critical.size:null,classified:classified.size,universe:places.size};
  }
  const api={municipality,sector,summary,number,esc};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Presentacion=api;
})(globalThis);
