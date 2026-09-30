/* Matrícula en sedes oficiales con colapso total/parcial o riesgo inminente. */
(function(root){
  'use strict';
  const ID='men_matricula_critica',SOURCE='MEN',SCOPE='simat5';
  const field={id:ID,source:SOURCE,label:'Estudiantes en sedes con daño crítico',share:.5,unit:'Estudiantes',
    note:'MEN · archivo 21/09/2026. Matrícula en sedes oficiales con colapso total, parcial o riesgo inminente de colapso. No equivale a estudiantes sin clases. En las vistas per cápita y relativa: por 10.000 habitantes.'};
  function create(data){
    const p=data.educationCritical||{},enabled=p.enabled===true;
    const municipalities=new Map((p.municipalities||[]).map(r=>[r.code,r]));
    function rows(places,date){
      if(!enabled||!p.report_date||date<p.report_date)return [];
      return places.flatMap(place=>{
        const r=municipalities.get(place.code);
        return r&&r.reported_sites>0&&Number.isInteger(r.critical_enrollment)&&r.critical_enrollment>=0
          ?[{...place,id:ID,i:field.label,f:SOURCE,dim:'Educación',u:field.unit,v:r.critical_enrollment,
            date,source_date:p.report_date,reported_sites:r.reported_sites,critical_sites:r.critical_sites}]:[];
      });
    }
    return {enabled,rows};
  }
  const api={ID,SOURCE,SCOPE,field,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MatriculaCritica=api;
})(globalThis);
