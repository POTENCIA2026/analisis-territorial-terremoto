/* Formato compacto de las observaciones incrustadas en el tablero.

   Cada observación repite los mismos textos (territorio, indicador, fuente, fecha). El generador
   guarda cada texto una sola vez en una lista y deja en cada fila solo su posición en esas listas
   más el valor. Aquí se reconstruyen las filas completas, idénticas a las del formato anterior,
   antes de que cualquier otro módulo lea DATA. No transforma valores ni descarta observaciones. */
(function(root){
  'use strict';
  var FORMATO='filas-compactas/v1';
  /* Partido en dos para que este mismo archivo, ya incrustado, no contenga la marca que busca. */
  var INICIO='const DATA='+'Datos.expandir(', FIN=');<'+'/script>';
  var COLUMNAS=['t','i','f','d','v'];

  function expandirFilas(c){
    if(Array.isArray(c))return c;
    if(!c||c.formato!==FORMATO)throw new Error('Formato de filas no reconocido: '+(c&&c.formato));
    var n=c.v.length,filas=new Array(n);
    COLUMNAS.forEach(function(k){if(!Array.isArray(c[k])||c[k].length!==n)throw new Error('Columna incompleta en filas compactas: '+k);});
    for(var k=0;k<n;k++){
      var g=c.territorios[c.t[k]],ind=c.indicadores[c.i[k]],fuente=c.fuentes[c.f[k]],fecha=c.fechas[c.d[k]];
      if(!g||!ind||fuente===undefined||fecha===undefined)throw new Error('Referencia fuera de rango en la fila '+k);
      filas[k]={lv:g[0],d:g[1],m:g[2],dim:ind[0],id:ind[1],i:ind[2],u:ind[3],f:fuente,v:c.v[k],date:fecha,code:g[3],identity_note:g[4],geo:g[5],join:g[6]};
    }
    return filas;
  }

  function compactarFilas(filas){
    function tabla(){var lista=[],indice=new Map();return {lista:lista,pos:function(clave,valor){var p=indice.get(clave);if(p===undefined){p=lista.length;indice.set(clave,p);lista.push(valor);}return p;}};}
    var T=tabla(),I=tabla(),F=tabla(),D=tabla(),c={formato:FORMATO,territorios:T.lista,indicadores:I.lista,fuentes:F.lista,fechas:D.lista,t:[],i:[],f:[],d:[],v:[]};
    filas.forEach(function(r){
      var g=[r.lv,r.d,r.m,r.code,r.identity_note,r.geo,r.join],ind=[r.dim,r.id,r.i,r.u];
      c.t.push(T.pos(JSON.stringify(g),g));c.i.push(I.pos(JSON.stringify(ind),ind));
      c.f.push(F.pos(r.f,r.f));c.d.push(D.pos(r.date,r.date));c.v.push(r.v);
    });
    return c;
  }

  /* Devuelve el mismo objeto con rows como arreglo de filas completas. */
  function expandir(data){
    if(data&&!Array.isArray(data.rows))data.rows=expandirFilas(data.rows);
    return data;
  }

  /* Lee DATA desde el HTML generado (pruebas y auditorías en Node). Acepta también el formato anterior. */
  function leerHtml(html){
    var a=html.indexOf(INICIO);
    if(a>=0){var b=html.indexOf(FIN,a);if(b<0)throw new Error('DATA sin cierre en el HTML');return expandir(JSON.parse(html.slice(a+INICIO.length,b)));}
    var m=html.match(/const DATA=([\s\S]*?);<\/script>/);
    if(!m)throw new Error('El HTML no contiene DATA');
    return JSON.parse(m[1]);
  }

  var api={FORMATO:FORMATO,expandir:expandir,expandirFilas:expandirFilas,compactarFilas:compactarFilas,leerHtml:leerHtml};
  root.Datos=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
