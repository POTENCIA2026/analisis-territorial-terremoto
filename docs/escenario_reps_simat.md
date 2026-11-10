# Escenario REPS/SIMAT sin Servicios comunitarios

Rama `relativo-reps-simat-sin-comunitarios`, nacida de main `5dd41e1b281f9afbd5291bbfc35054b54a04eebb`.
Cambio solicitado: sedes registradas como proxy de oferta y retirar Comunitarios del índice.
No se integra la rama ML ni se modifican main o GitHub Pages.

## Cinco dimensiones y tres versiones

Impacto humano, Vivienda, Salud, Educación e Infraestructura y acceso pesan 1/5 cada una.
Se conservan las variables y pesos internos de main, incluido familias en Impacto humano.
La exclusión de Comunitarios afecta al índice absoluto, per cápita y relativo, sus matrices,
radares, fórmulas, cobertura, ranking y comparación con recuperación temprana.
Los datos originales comunitarios permanecen consultables en diagnóstico territorial;
no se borran registros ni se alteran los índices publicados por PNUD/UNGRD.

Se mantienen IPM censal DANE 2018, normalización por máximo, filtros y fuentes del numerador.
En Salud y Educación main conserva canales 3iS/PNUD con peso interno 1/2 cada uno.
Se calculan por separado; NO se suman afectados ni se consideran corroboraciones independientes.

## Relativo: denominadores observados, sin ML

| Dimensión | Denominador | Corte | Unidad del cociente |
|---|---|---|---|
| Salud | Sedes de clase IPS, por código único y municipio de la sede | REPS 12/03/2026 | afectados / sede IPS registrada |
| Educación | TOTAL_SEDES por municipio; suma de sectores y zonas excluyentes | MEN SINEB/SIMAT 2022 | afectados / sede educativa registrada |
| Personas y Vivienda | Bases DANE que ya usaba main | 2026 | por 10.000 habitantes / por 100 viviendas |
| Infraestructura | Sin inventario compatible habilitado | — | sin dato relativo |

La publicación educativa utilizada es [Sedes 2022 del MEN](https://portalsineb.mineducacion.gov.co/1782/articles-417663_recurso_1.csv),
enlazada desde [Bases consolidadas](https://portalsineb.mineducacion.gov.co/portal/secciones/Informacion-Estadistica/Bases-consolidadas/).
[El MEN explica](https://portalsineb.mineducacion.gov.co/portal/secciones/SINEB/) que las estadísticas
de establecimientos/sedes se derivan de la matrícula de cada vigencia, capturada por SIMAT.
Es un inventario agregado de sedes asociadas a matrícula, no una descarga nominal del DUE,
ni un conteo de alumnos. NO se presenta como SIMAT 2025 ni 2026.
El 31/12/2022 del archivo de integración representa el final de la vigencia, no una fecha
observada de inspección. No se verificó la fecha exacta de publicación del CSV.

REPS proviene de la extracción ya conservada en main, con consulta y hash originales.
No se sustituye el número de sedes por consultorios, camas o predicciones.
El CSV educativo se congela y se verifica contra SHA-256 antes de procesarlo.

## Fórmulas

Para Salud y Educación:
```
q = afectados de la fuente / sedes registradas del municipio
z = 100 × q / máximo q de la misma fuente e indicador en el ámbito y captura
Sector = suma(z × peso interno)
D = (Impacto humano + Vivienda + Salud + Educación + Infraestructura) / 5
P = D × (1 + 0,25 × IPM/100) / 1,25
```

Ceros explícitos con denominador válido producen cero. Sin denominador, numerador,
identidad o procedencia aceptada, no hay tasa. Los pesos faltantes no se redistribuyen:
se mantienen los límites inferior/superior de main. No son intervalos de confianza ni
recogen error de registro, antigüedad o falta de correspondencia entre fuentes.

Un cociente mayor que uno permanece visible. Por ejemplo, Atrato puede dar 9/3=3;
no se oculta ni se recorta a 1 y no se interpreta como 300% de edificios destruidos.
Se marca `exceedsRegistry` y queda incluido en el archivo de auditoría.
La normalización 0–100 se conserva: 100 identifica el máximo del universo, no pérdida total.
Cambiar decreto/todos recalcula máximos y puestos; búsquedas y departamento no recalibran.

## Límites del ensayo

- Sedes registradas son un proxy de oferta; registro no certifica operación.
- Distintos códigos de sede podrían compartir inmueble.
- Los agregados PNUD/3iS no están conciliados nominalmente con REPS/MEN.
- MEN cubre preescolar, básica y media; el alcance exacto de los afectados puede diferir.
- La base educativa es histórica: cuatro años antes de los daños del tablero.
- Infraestructura continúa sin denominadores habilitados; no se inventó una base.
- No se alteran otros índices históricos HTML ni el generador del índice departamental original.
  El artefacto de esta propuesta es `index.html`.

## Reproducir

```sh
python scripts/preparar_reps_simat.py
python -m unittest discover -s tests -v
node --test tests/*.test.js
python generar_tablero_recuperacion.py --eda-redirect index.html
node scripts/auditar_reps_simat.cjs
```

La corrida guarda cobertura, ratios superiores a uno, máximos, top 10 y R² por ámbito/modo.
Estos diagnósticos son descriptivos, no validación del indicador por concordar con UNGRD.
