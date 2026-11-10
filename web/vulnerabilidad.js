
/* Vulnerabilidad censal 2018: módulo independiente; no modifica Afectación ni Prioridad. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VulnerabilidadMunicipal=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const N=1101, FIELDS=['IPM','ruralidad','dependencia','pIPM','pRuralidad','pDependencia','Vtercios'];
  const FIVE=new Set(['17','27','63','66','76']);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
  const num=(v,d=2)=>Number.isFinite(v)?new Intl.NumberFormat('es-CO',{maximumFractionDigits:d}).format(v):'Sin dato';
  const code=v=>/^\d{5}$/.test(String(v??''))?String(v):null;
  const score=r=>['pIPM','pRuralidad','pDependencia'].every(k=>Number.isFinite(r?.[k]))?(r.pIPM+r.pRuralidad+r.pDependencia)/3:null;
  function create(packet,data={},decreeNames=[]){
    if(packet.registros.length!==N)throw new Error('Vulnerabilidad requiere el universo nacional fijo de 1.101 registros.');
    const included=new Map();
    for(const source of packet.registros){
      if(!code(source.codigo)||included.has(source.codigo))throw new Error('DIVIPOLA inválido o duplicado.');
      const row={codigo:source.codigo,nombre:source.nombre,dpto:source.dpto};
      for(const k of FIELDS)row[k]=Number.isFinite(source[k])?source[k]:null;
      const calculated=score(row);
      if(calculated===null||row.Vtercios===null||Math.abs(calculated-row.Vtercios)>1e-10)throw new Error('Puntaje incompatible con los tres pesos iguales.');
      row.Vtercios=calculated;
      for(const k of ['pIPM','pRuralidad','pDependencia'])if(row[k]<0||row[k]>100)throw new Error('Percentil fuera de escala.');
      included.set(row.codigo,row);
    }
    // Percentiles derivados de semirrangos: ignorar solo el ruido de coma flotante
    // (menor que 1e-10), nunca redondear puntajes antes de ordenar.
    const compare=(a,b)=>Math.abs(a.Vtercios-b.Vtercios)<1e-10?a.codigo.localeCompare(b.codigo):b.Vtercios-a.Vtercios;
    const ranked=[...included.values()].sort(compare);
    let lastScore=null,lastRank=0;
    ranked.forEach((r,i)=>{if(lastScore===null||Math.abs(r.Vtercios-lastScore)>=1e-10)lastRank=i+1;r.rank=lastRank;lastScore=r.Vtercios;});
    const catalogue=new Map(included),exclusions=new Map((packet.metadata.exclusiones||[]).map(r=>[r.codigo,r.motivo]));
    for(const row of [...(data.baseline?.rows||[]),...(data.population?.rows||[]),...(data.educationUniverse?.municipalities||[]),...(data.rows||[]).filter(r=>r.lv==='municipal')]){
      const id=code(row.code);
      if(!id||catalogue.has(id))continue;
      const r={codigo:id,nombre:row.m||row.nombre||id,dpto:row.d||row.dpto||'Sin departamento',rank:null,reason:exclusions.get(id)||'Sin registro comparable en la geografía censal de 2018.'};
      FIELDS.forEach(k=>r[k]=null);catalogue.set(id,r);
    }
    const decree=new Set([...decreeNames].map(norm));
    const all=[...catalogue.values()].sort((a,b)=>a.Vtercios!==null&&b.Vtercios!==null?compare(a,b):a.Vtercios===null&&b.Vtercios===null?a.nombre.localeCompare(b.nombre,'es')||a.codigo.localeCompare(b.codigo):a.Vtercios===null?1:-1);
    const inScope=(r,scope)=>scope==='simat5'?FIVE.has(r.codigo.slice(0,2)):scope==='decree'?decree.has(norm(r.dpto)):true;
    const territories=(scope='all',dept='')=>all.filter(r=>inScope(r,scope)&&(!dept||r.codigo.slice(0,2)===dept));
    const filtered=({scope='all',dept='',search=''}={})=>{const q=norm(search);return territories(scope,dept).filter(r=>!q||norm(r.nombre+' '+r.dpto+' '+r.codigo).includes(q));};
    function departments(scope='all'){
      return [...new Map(territories(scope).map(r=>[r.codigo.slice(0,2),{code:r.codigo.slice(0,2),name:r.dpto}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
    }
    return {n:N,all,ranked,get:id=>catalogue.get(String(id))||null,filtered,territories,departments};
  }
  function mount(packet,data,options={}){
    const doc=options.document||document,$=id=>doc.getElementById(id),model=create(packet,data,options.decreeNames||[]);
    const state={scope:'all',dept:'',search:'',selected:'66001',limit:25};
    function updateDepartments(){
      const deps=model.departments(state.scope);
      if(!deps.some(r=>r.code===state.dept))state.dept='';
      $('vuln-dept').innerHTML='<option value="">Todos los departamentos</option>'+deps.map(r=>`<option value="${esc(r.code)}">${esc(r.name)}</option>`).join('');
      $('vuln-dept').value=state.dept;
    }
    function renderProfile(){
      const r=model.get(state.selected),host=$('vuln-profile');
      if(!r){host.innerHTML='<p class="empty">Selecciona un municipio para ver sus componentes.</p>';return;}
      const missing=r.Vtercios===null;
      const components=[
        {id:'IPM',p:'pIPM',label:'Pobreza multidimensional',short:'IPM',unit:'% de población',formula:'IPM censal · total municipal',color:'var(--series-1)'},
        {id:'ruralidad',p:'pRuralidad',label:'Ruralidad',short:'Ruralidad',unit:'% de población censada',formula:'Centros poblados + rural disperso / total',color:'var(--series-3)'},
        {id:'dependencia',p:'pDependencia',label:'Dependencia demográfica',short:'Dependencia',unit:'por cada 100 personas de 15–64',formula:'(0–14 años + 65 y más) / 15–64 años',color:'var(--series-2)'}
      ];
      host.innerHTML=`<header class="vuln-profile-head"><div><span class="kicker">Perfil municipal · CNPV 2018</span><h3>${esc(r.nombre)} <span>${esc(r.dpto)}</span></h3><p class="small muted">DIVIPOLA ${esc(r.codigo)}</p></div><div class="vuln-rank">${missing?'Sin puesto nacional':`<strong>#${num(r.rank,0)}</strong><span>de 1.101 · mayor V primero</span>`}</div></header>
        <div class="vuln-profile-grid"><div class="vuln-score"><span>Vulnerabilidad</span><strong id="vuln-score-value">${missing?'Sin dato':num(r.Vtercios)}</strong>${missing?'':`<span class="vuln-score-scale">puntos / 100</span>`}<div class="vuln-score-track" aria-hidden="true"><i style="width:${missing?0:r.Vtercios}%"></i></div><p>${missing?esc(r.reason):'Tres componentes · peso igual de ⅓'}</p></div>
        <div class="vuln-components">${components.map(c=>`<article class="vuln-component" data-vuln-component="${c.id}" style="--component-color:${c.color}"><div class="vuln-component-title"><h4>${c.label}</h4><span class="vuln-weight">⅓</span></div><div class="vuln-raw"><strong>${num(r[c.id])}${r[c.id]===null?'':c.id==='dependencia'?'':'%'}</strong><span>${c.unit}</span></div><div class="vuln-percentile"><span>Percentil nacional</span><b>${r[c.p]===null?'Sin dato':num(r[c.p])+' / 100'}</b></div><div class="vuln-component-track" aria-hidden="true"><i style="width:${r[c.p]??0}%"></i></div><p class="small muted">${c.formula}</p></article>`).join('')}</div></div>
        <p class="vuln-reading small">${missing?'Sin registro comparable: no se imputan ceros ni valores de otros territorios.':`V = (${num(r.pIPM)} + ${num(r.pRuralidad)} + ${num(r.pDependencia)}) / 3 = <strong>${num(r.Vtercios)}</strong>. Se calcula sin redondear; el redondeo es solo visual.`}</p>`;
    }
    function renderTable(){
      const rows=model.filtered(state),scored=rows.filter(r=>r.Vtercios!==null).length,visible=rows.slice(0,state.limit);
      $('vuln-count').textContent=`${num(scored,0)} con puntaje${rows.length-scored?' · '+num(rows.length-scored,0)+' sin dato comparable':''} · mostrando ${num(visible.length,0)} de ${num(rows.length,0)} coincidencias.`;
      $('vuln-ranking').innerHTML=rows.length?`<table><caption class="sr-only">Ranking de vulnerabilidad, de mayor a menor puntaje. Puestos nacionales fijos.</caption><thead><tr><th scope="col">Puesto nacional</th><th scope="col">Municipio</th><th scope="col">V / 100</th><th scope="col">pIPM</th><th scope="col">pRuralidad</th><th scope="col">pDependencia</th></tr></thead><tbody>${visible.map(r=>`<tr${r.codigo===state.selected?' class="is-selected"':''}><td class="num">${r.rank===null?'—':'#'+num(r.rank,0)}</td><th scope="row"><button type="button" class="vuln-municipality-link" data-vuln-code="${esc(r.codigo)}"${r.codigo===state.selected?' aria-current="true"':''}>${esc(r.nombre)}</button><span class="small muted">${esc(r.dpto)} · ${esc(r.codigo)}</span></th><td class="num vuln-table-score">${num(r.Vtercios)}</td><td class="num">${num(r.pIPM)}</td><td class="num">${num(r.pRuralidad)}</td><td class="num">${num(r.pDependencia)}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">No hay coincidencias. Prueba otro municipio o código DIVIPOLA.</p>';
      $('vuln-more').hidden=visible.length>=rows.length;
    }
    function render(){
      const rows=model.territories(state.scope,state.dept);
      if(!rows.some(r=>r.codigo===state.selected))state.selected=rows.find(r=>r.codigo==='66001')?.codigo||rows[0]?.codigo||'';
      $('vuln-municipality').innerHTML=rows.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')||a.codigo.localeCompare(b.codigo)).map(r=>`<option value="${esc(r.codigo)}">${esc(r.nombre)} · ${esc(r.dpto)}${r.Vtercios===null?' · Sin dato':''}</option>`).join('');
      $('vuln-municipality').value=state.selected;
      renderProfile();renderTable();
    }
    function select(id,focus=false){
      if(!model.territories(state.scope,state.dept).some(r=>r.codigo===id))return false;
      state.selected=id;$('vuln-municipality').value=id;renderProfile();renderTable();
      if(focus){$('vuln-profile').focus({preventScroll:true});$('vuln-profile').scrollIntoView({block:'start',behavior:'auto'});}
      return true;
    }
    $('vuln-scope').addEventListener('change',()=>{state.scope=$('vuln-scope').value;state.limit=25;updateDepartments();render();});
    $('vuln-dept').addEventListener('change',()=>{state.dept=$('vuln-dept').value;state.limit=25;render();});
    $('vuln-search').addEventListener('input',()=>{state.search=$('vuln-search').value;state.limit=25;renderTable();$('vuln-ranking').scrollTop=0;});
    $('vuln-municipality').addEventListener('change',()=>select($('vuln-municipality').value));
    $('vuln-ranking').addEventListener('click',e=>{const b=e.target.closest('[data-vuln-code]');if(b)select(b.dataset.vulnCode,true);});
    $('vuln-more').addEventListener('click',()=>{state.limit+=50;renderTable();});
    $('vuln-reset').addEventListener('click',()=>{Object.assign(state,{scope:'all',dept:'',search:'',limit:25});$('vuln-scope').value='all';$('vuln-search').value='';updateDepartments();render();});
    updateDepartments();render();
    return {model,getState:()=>({...state}),select,render};
  }
  return {create,mount,score,N};
});

