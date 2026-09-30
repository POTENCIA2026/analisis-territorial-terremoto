/* Paired descriptive comparison. Never recalibrates indices on the paired sample. */
(function(root){
  'use strict';
  const MODES=['absolute','percapita','sectorial'];
  const P=typeof module!=='undefined'&&module.exports?require('./priorizacion.js'):root.Priorizacion;
  function midranks(values){
    const sorted=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v),out=[];
    for(let i=0;i<sorted.length;){
      let j=i+1;while(j<sorted.length&&sorted[j].v===sorted[i].v)j++;
      for(let k=i;k<j;k++)out[sorted[k].i]=(i+1+j)/2;
      i=j;
    }
    return out;
  }
  function fit(xs,ys){
    if(xs.length!==ys.length||xs.length<2||!xs.every(Number.isFinite)||!ys.every(Number.isFinite))return null;
    const n=xs.length,mx=xs.reduce((s,x)=>s+x,0)/n,my=ys.reduce((s,y)=>s+y,0)/n;
    let xx=0,yy=0,xy=0;
    xs.forEach((x,i)=>{xx+=(x-mx)**2;yy+=(ys[i]-my)**2;xy+=(x-mx)*(ys[i]-my);});
    if(xx===0||yy===0)return null;
    const r=Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)));
    return {r,r2:r*r,slope:xy/xx,intercept:my-xy/xx*mx};
  }
  function statistics(pairs){
    const xs=pairs.map(p=>p.x),ys=pairs.map(p=>p.y);
    // At least 3 observations: avoid the vacuous R²=1 from any two distinct points.
    const regression=pairs.length>=3?fit(xs,ys):null;
    const rankFit=pairs.length>=3?fit(midranks(xs),midranks(ys)):null;
    return {n:pairs.length,regression,rho:rankFit?.r??null,
      reason:pairs.length<3?'Se requieren al menos tres pares.':!regression?'Una de las series es constante: correlación y R² no definidos.':''};
  }
  function compare(models,territorial,state,{mode='absolute',panel='common',axis='rank'}={}){
    if(!MODES.includes(mode))throw new Error('Modo desconocido');
    const results=Object.fromEntries(MODES.map(k=>[k,models[k].compute(state)]));
    const maps=Object.fromEntries(MODES.map(k=>[k,new Map(results[k].items.map(r=>[r.geo,r]))]));
    const rows=territorial.strict(territorial.visible({...state,dept:''}),'undp_rapida_recovery_needs');
    const groups=new Map();
    rows.filter(r=>Number.isFinite(r.v)).forEach(r=>{if(!groups.has(r.geo))groups.set(r.geo,[]);groups.get(r.geo).push(r);});
    const unique=[...groups.values()].filter(rs=>rs.every(r=>r.v===rs[0].v)).map(rs=>rs[0]);
    const recovery=new Map(territorial.ranked(unique).map(r=>[r.geo,r]));
    const universe=results[mode].all.filter(r=>!state.dept||r.d===state.dept);
    const excluded={index:0,rapida:0,common:0},pairs=[];
    for(const place of universe){
      const own=maps[mode].get(place.geo),rec=recovery.get(place.geo);
      if(!own||!Number.isFinite(own.lower)){excluded.index++;continue;}
      if(!rec){excluded.rapida++;continue;}
      if(panel==='common'&&!MODES.every(k=>maps[k].has(place.geo))){excluded.common++;continue;}
      pairs.push({geo:place.geo,m:place.m,d:place.d,x:own.lower,y:axis==='rank'?rec.rank:rec.v,
        lower:own.lower,upper:own.upper,ownRank:own.rank,recoveryRank:rec.rank,recovery:rec.v,
        available:own.available,fieldCount:own.fieldCount,coverage:own.coverage});
    }
    return {pairs,...statistics(pairs),excluded,total:universe.length,referenceN:results[mode].referenceN,
      recoveryN:recovery.size,mode,panel,axis};
  }
  // Separate municipal pairs per dimension; missing scores are not observed zeroes.
  // Visibility and the paired sample never recalibrate the underlying scores.
  function compareDimensions(models,territorial,state,{mode='absolute',included=null}={}){
    const comparison=compare(models,territorial,state,{mode,panel:'available',axis:'value'});
    const result=models[mode].compute(state),definitions=result.definitions;
    const ids=definitions.map(s=>s.id),active=new Set(included===null?ids:included);
    if([...active].some(id=>!ids.includes(id)))throw new Error('Dimensión desconocida');
    const own=new Map(result.items.map(r=>[r.geo,r]));
    const series=definitions.map(def=>{
      const pairs=comparison.pairs.flatMap(pair=>{
        const sector=own.get(pair.geo).sectors.find(s=>s.id===def.id);
        if(!sector||!(sector.coverage>1e-8)||!Number.isFinite(sector.lower))return [];
        return [{...pair,x:sector.lower,dimension:def.id,dimensionName:def.name,
          sectorUpper:sector.upper,sectorCoverage:sector.coverage}];
      });
      return {...def,pairs,...statistics(pairs),visible:active.has(def.id),
        missing:comparison.n-pairs.length,partial:pairs.filter(p=>p.sectorCoverage<1-1e-8).length};
    });
    return {series,definitions,active:[...active],comparison,mode};
  }
  // Exact additive decomposition, not a regression of the index against its own inputs.
  // Removing a sector leaves its original weight unused: no reweighting or rescaling.
  function contributions(models,state,{mode='absolute',included=null}={}){
    if(!MODES.includes(mode))throw new Error('Modo desconocido');
    const result=models[mode].compute(state),definitions=result.definitions;
    const ids=definitions.map(s=>s.id),active=new Set(included===null?ids:included);
    if([...active].some(id=>!ids.includes(id)))throw new Error('Dimensión desconocida');
    const weights=definitions.map(()=>1),count=definitions.length;
    const all=result.items.map(r=>{
      const keep=predicate=>P.aggregate(r.sectors.map(s=>predicate(s)?s:{...s,lower:0,upper:0}),r.vulnerability,weights);
      const sectors=r.sectors.map(s=>({id:s.id,name:s.name,coverage:s.coverage,
        included:active.has(s.id),...keep(other=>other.id===s.id)}));
      const selected=keep(s=>active.has(s.id));
      const selectedKnown=r.sectors.some(s=>active.has(s.id)&&s.coverage>1e-8);
      return {...r,contributions:sectors,selectedLower:selected.lower,selectedUpper:selected.upper,
        selectedKnown,removed:r.lower-selected.lower,selectedRank:null};
    });
    // Both rankings use the whole territorial reference, never the text/department filter.
    const selectedRanks=new Map(P.ranks(all.filter(r=>r.selectedKnown).map(r=>({...r,lower:r.selectedLower}))).map(r=>[r.geo,r.rank]));
    const rows=all.filter(r=>!state.dept||r.d===state.dept).map(r=>({...r,selectedRank:selectedRanks.get(r.geo)??null}));
    return {rows,definitions,active:[...active],mode,referenceN:result.referenceN,
      excluded:result.missing.filter(r=>!state.dept||r.d===state.dept).length,
      sectorWeight:count?1/count:0};
  }
  const api={MODES,midranks,fit,statistics,compare,compareDimensions,contributions};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Comparacion=api;
})(typeof globalThis!=='undefined'?globalThis:this);
