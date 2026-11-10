# Exploración educativa por municipio

La vista «Prioridad de inversión» permite revisar datos antes de escoger una metodología. No calcula un índice, pesos, umbrales de severidad ni un ranking.

El selector utiliza el catálogo DANE existente, con nombre, departamento y código. El cruce MEN es por código municipal (D); las sedes se cuentan por código DANE de sede (J), nunca por institución. No se aplican los filtros de las otras pestañas a esta vista. Un municipio sin filas MEN se muestra como **sin registros**, no como cero afectaciones.

La vista tiene cinco bloques: Educación, Vulnerabilidad territorial, Vivienda, Salud e Infraestructura y acceso. Son cuatro sectores más un contexto transversal. Educación reúne pestañas de Oferta educativa, Afectación, Contexto educativo, Recuperación e Intervenciones; la pestaña elegida se mantiene al cambiar de municipio. Vivienda, Salud e Infraestructura tienen espacios reservados, sin datos ni puntuaciones inventadas.

## Fuentes y gráficos

- MEN: `data/men_sedes_escolares_afectadas_20260921.xlsx`, `Sheet1`. Fecha del nombre del archivo: 2026-09-21; fecha de matrícula no acreditada. Solo sedes oficiales del reporte. Daños AP, matrícula AM, zona L, etiqueta conjunta PDET/ZOMAC AR, servicio AX, estrategia AY y modalidad AZ.
- MEN nacional: [Matrícula en preescolar, básica y media](https://www.datos.gov.co/d/ngw5-c5nw), **2025**, último año verificado en la API el 8 de octubre de 2026. Se incluyen todas sus 2.321.933 filas estadísticas de ese año, sumadas por sede: **53.005 códigos de sede, 9.311.478 matrículas y 1.121 municipios**. Oficiales y no oficiales. Las filas estadísticas son grupos de matrícula, no sedes adicionales ni registros personales. No se descarga la serie histórica 2010–2024 ni se acredita un censo de sedes cerradas o sin matrícula. Papunahua (97777) no aparece en este corte: se muestra sin registros, no con cero sedes.
- MEN cobertura: [Estadísticas educativas por municipio](https://www.datos.gov.co/d/nudc-7mev), **2024**, último año publicado verificado, 1.122 municipios. Se usa cobertura neta total en puntos porcentuales, sin multiplicar por 100. Valores superiores a 100 se conservan y se marcan como parciales, pendientes de revisión del denominador antes de priorizar. Pereira publica **102,45 %**.
- IPM: línea base DANE censal 2018 ya integrada. Conserva año y localizador de la fuente.
- Afectación: distribución de sedes o matrícula por categorías originales del MEN. No se agrupan como severas/críticas. “Sin afectación” y categorías desconocidas no se suman como afectadas. Una categoría desconocida impide emitir un total completo de afectación.
- Oferta educativa: sedes y matrícula por sector y zona, con el mismo universo de 2025. El porcentaje de matrícula oficial usa numerador y denominador del mismo corte. La fuente nacional tiene actualización de datos del 27/08/2026; su **año de observación sigue siendo 2025**. La base de cobertura fue actualizada el 13/11/2025 y describe 2024.
- Vulnerabilidad territorial: IPM 2018 y PDET/ZOMAC como etiqueta del MEN pendiente de contraste oficial. Estos tres indicadores son transversales. Ruralidad de la matrícula afectada, dependencia oficial, cobertura y primera infancia quedan dentro de la pestaña Contexto educativo, porque su universo es educativo.
- Capacidad: se visualizan las estrategias de continuidad como contexto. No prueban capacidad de recepción, cupos ni acceso. La matrícula de una sede con modalidad temporal no mide cuántos de sus alumnos usan esa modalidad.
- Intervenciones: mapa de información pendiente; no se deduce que haya cero proyectos de la ausencia de un inventario integrado.

La lista comprende 7 indicadores de afectación y 8 de vulnerabilidad de la revisión de educación (PDET y ZOMAC se separan), más 4 campos de capacidad y 5 de intervenciones. El conteo de disponibilidad es una lista de trabajo, no una medida de prioridad. Disponible: se puede mostrar el dato con alcance y año. Parcial: falta precisar un universo, una categoría o contrastar una fuente. Sin dato: no integrado. No se usan denominadores municipales de otro año para completar tasas.

La reorganización conserva los 24 campos: 21 dentro de Educación (7 + 5 + 4 + 5) y 3 en Vulnerabilidad territorial. Los otros tres sectores no se incluyen en el conteo hasta incorporar sus indicadores.

## Cruce con el reporte de afectadas

Se exige coincidencia exacta de código DANE de sede, municipio y sector oficial; no se cruza por nombre de institución ni se deduce la ubicación a partir del prefijo del código de sede. En todo el reporte: **5.508 coincidencias de 5.537 sedes**, 28 códigos ausentes en matrícula 2025 y 1 diferencia de municipio. Las excepciones quedan en `data/men_universo.json`, campo `crosswalk_exceptions`. Pueden requerir revisar cambios entre años; no se etiquetan automáticamente como errores ni como sedes sin afectación.

Pereira: **319 sedes y 82.902 matrículas** en 2025; 170 sedes oficiales con 61.947 matrículas y 149 no oficiales con 20.955. Las 167 sedes del reporte de afectadas coinciden con sedes oficiales de 2025. La coincidencia de códigos no acredita compatibilidad temporal de las matrículas. Los porcentajes de matrícula municipal y oficial afectada siguen **parciales**; no se divide la matrícula de fecha no acreditada entre la de 2025. La base nacional tampoco incorpora coordenadas ni acredita cupos o capacidad receptora.

`data/men_abierto/sedes.json.gz` conserva la respuesta nacional agregada por sede, sin filtrar por daño, y `cobertura.json` la respuesta municipal completa de 2024. `fuentes.json` conserva consulta, fecha, año y controles del servidor. `data/men_universo.json` contiene los resúmenes usados por el tablero y SHA-256 de las instantáneas y del reporte cruzado. La descarga ordena y pagina explícitamente; comprueba totales de filas, matrícula, sedes y municipios contra una consulta independiente, y rechaza duplicados, matrículas incompletas o cambios de versión durante la descarga.

## Actualización

Desde la raíz del repositorio, con `openpyxl` disponible:

```powershell
python -m scripts.preparar_inversion_educativa
python -m scripts.preparar_men_abierto
python generar_tablero_recuperacion.py
```

El JSON agregado conserva el SHA-256 de su fuente; la extracción rechaza códigos duplicados, sectores inesperados o un cambio del esquema MEN. Los valores desconocidos se guardan como `null`. El tablero funciona sin red con los agregados incrustados. Los enlaces permiten consultar las fuentes por separado.

Para volver a descargar las fuentes públicas (opcional, requiere red): `python -m scripts.preparar_men_abierto --download --year 2025 --coverage-year 2024`. Sin `--download`, la preparación utiliza únicamente las instantáneas locales. Los demás indicadores y sus denominadores anteriores conservan sus fuentes; esta integración corresponde a la exploración de Prioridad de inversión.
