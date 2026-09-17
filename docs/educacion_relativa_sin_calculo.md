# Educación relativa: indicador reactivado

Estado actual (17 de septiembre de 2026): a petición del usuario, vuelve a calcularse Educación relativa en la rama salud-presion-hospitalizacion-sin-heridos-ih. El nombre de este archivo conserva la trazabilidad del retiro anterior.

## Cálculo vigente

- Centros educativos afectados: PNUD; 3iS únicamente si falta un valor válido PNUD. Un cero PNUD no activa el respaldo.
- Denominador: sedes de preescolar, básica y media registradas en MEN/SINEB-SIMAT 2022, sectores oficial/no oficial y zonas urbana/rural.
- Cociente = centros afectados / sedes registradas.
- Puntaje = 100 × min(cociente, 1). El tope es fijo: no se divide por el máximo municipal. Un cociente de 0,5 da 50; 1 y los superiores a 1 dan 100.
- Los valores originales y los cocientes superiores a 1 se conservan. El tope es una regla del puntaje: no demuestra que todas las sedes estén afectadas ni corrige diferencias entre registros.
- Cambiar entre todos los municipios y los del decreto no cambia este puntaje educativo; las posiciones y otros componentes del índice sí pueden cambiar.
- Sin inventario compatible o sin numerador, no hay puntaje; los faltantes no son ceros.
- Se conservan los cinco sectores, cada uno con peso 1/5. Educación vuelve a aportar al índice relativo, la matriz, el radar y la comparación con necesidad de recuperación temprana.

No se modificaron Salud, sus camas históricas, el inventario educativo, los datos originales ni los índices absoluto y per cápita. Verificación contra el commit anterior: f6f68992c6b551cb92549b9f3c5e4f5df46f80c6. Resultado automático: docs/verificacion_educacion_relativa.json.

## Historia

La modificación previa retiró únicamente el cálculo relativo educativo después de corregir una eliminación excesiva de toda la dimensión. Esta reactivación no altera el diseño del tablero ni elimina la opción técnica de desactivar indicadores en otra configuración.

## Revisión de cortes disponibles

El portal SINEB presenta cifras de sedes 2025 y un boletín hasta 2024, pero el catálogo de bases consolidadas consultado enlaza la descarga municipal de sedes hasta 2022. No se ha sustituido un inventario municipal por cifras nacionales.

- https://portalsineb.mineducacion.gov.co/portal/
- https://portalsineb.mineducacion.gov.co/portal/secciones/Informacion-Estadistica/Bases-consolidadas/

Minsalud publica información de capacidad hospitalaria de 2026 y REPS ofrece consulta de capacidad vigente; eso acredita que existe información posterior a 2022, no que hayamos verificado un extracto nacional municipal de camas generales adultas y pediátricas anterior al evento. Se conserva REPS 2022 hasta verificar un reemplazo homogéneo.

- https://www.minsalud.gov.co/Comunicaciones/noticias/2026/Paginas/cifras-oficiales-servicios-de-salud-valle-del-cauca.aspx
- https://prestadores.minsalud.gov.co/habilitacion/
