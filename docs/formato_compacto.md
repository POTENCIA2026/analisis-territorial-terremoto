# Formato compacto de `index.html`

## El problema

El tablero lleva sus datos dentro del propio HTML. Cada observación era un objeto con 14 campos:

```json
{"lv":"departamental","d":"Antioquia","m":"","dim":"Infraestructura","id":"3is_acueductos",
 "i":"Acueductos afectados (3iS, oficial)","u":"Número","f":"3iS-Sheets","v":9,
 "date":"2026-09-28","code":"05","identity_note":"","geo":"departamental:05","join":"DIVIPOLA"}
```

Son unos 270 caracteres y lo único propio de la fila es el valor (`9`). El resto se repite en miles
de filas: en la captura del 28 de septiembre de 2026 hay 16.854 observaciones, pero solo 698
territorios, 65 indicadores, 8 fuentes y 1 fecha. Con el historial incrustado, el `index.html` del
repositorio original llegó a 104,6 MB, a 250 KB del límite de 100 MB por archivo de GitHub.

## El formato

`DATA.rows` deja de ser una lista de objetos y pasa a ser:

```json
{"formato": "filas-compactas/v1",
 "territorios": [["departamental","Antioquia","","05","","departamental:05","DIVIPOLA"], ...],
 "indicadores": [["Infraestructura","3is_acueductos","Acueductos afectados (3iS, oficial)","Número"], ...],
 "fuentes": ["3iS-Sheets", ...],
 "fechas": ["2026-09-28", ...],
 "t": [0, 0, 1, ...], "i": [0, 1, 0, ...], "f": [0, 0, 0, ...], "d": [0, 0, 0, ...], "v": [9, 3, 1, ...]}
```

- `territorios`: `[lv, d, m, code, identity_note, geo, join]`.
- `indicadores`: `[dim, id, i, u]`.
- `t`, `i`, `f`, `d`, `v` son columnas paralelas, una posición por fila: la fila *k* es el
  territorio `territorios[t[k]]`, el indicador `indicadores[i[k]]`, la fuente `fuentes[f[k]]`, la
  fecha `fechas[d[k]]` y el valor `v[k]`.

El resto de `DATA` (`dates`, `latest`, `sources`, `baseline`, `population`, `denominators`, …) no cambia.

## Quién lo escribe y quién lo lee

| | Dónde | Función |
|---|---|---|
| Escribe | `generar_tablero_recuperacion.py` | `compact_rows(rows)` |
| Lee en el navegador | `web/datos.js` | `Datos.expandir(data)` |
| Lee en pruebas y auditorías (Node) | `web/datos.js` | `Datos.leerHtml(html)` |
| Lee en pruebas (Python) | `generar_tablero_recuperacion.py` | `read_embedded_data(html)` |

En el HTML queda `const DATA=Datos.expandir({...});`. `expandir` reconstruye las filas completas, con
las mismas columnas y en el mismo orden, antes de que se ejecute cualquier otro módulo. El resto del
tablero no sabe que el formato existe.

Las listas **no se mantienen a mano**: se construyen de nuevo en cada generación a partir de las
filas. Un indicador, una fecha, una fuente o un territorio nuevo entra solo a su lista. Las
posiciones son internas de cada archivo y pueden cambiar de una generación a otra.

Los datos en formato completo siguen en los CSV (`indicadores_largo_no_calculo.csv` y
`historial_indicadores_no_calculo.csv`); el formato compacto solo existe dentro del HTML.

## Garantías

- **Sin pérdida.** `expand_rows(compact_rows(rows)) == rows`, incluido el orden de columnas. Lo
  comprueban `tests/test_tablero_recuperacion.py` (`CompactRowsTests`), que además ejecuta el
  decodificador de JavaScript y compara su salida con la de Python.
- **Falla en vez de adivinar.** `compact_rows` rechaza filas con columnas distintas de las 14
  esperadas; `expandir` rechaza formatos desconocidos, columnas de distinta longitud y posiciones
  fuera de rango.
- **Mismo tablero.** Con el inventario del repositorio, el HTML generado es idéntico byte a byte a la
  versión de referencia del 3 de noviembre de 2026, salvo tres cosas: `DATA.rows` compacto, el
  decodificador (`web/datos.js`) y la marca de tiempo `generated`.
- **`index.html` al día.** `scripts/verificar_index.py` regenera el tablero y lo compara con el
  archivo versionado; corre en `.github/workflows/pruebas.yml`.

## Tamaños

| Archivo | Tamaño |
|---|---|
| `index.html` del repositorio original (historial de 22 fechas, formato largo) | 104,6 MB |
| Versión de referencia (solo la captura vigente, formato largo) | 8,9 MB |
| `index.html` de este repositorio (solo la captura vigente, compacto) | 4,7 MB |

Con `--embed-history` cada fecha adicional suma unos 0,3 MB en lugar de 4,5 MB.

## Lo que no hace

No guarda «solo lo que cambia» entre fechas. En el historial, el 95 % de las filas repite el valor
de otra fecha; aprovecharlo reduciría más el archivo, pero obliga a cambiar cómo el tablero consulta
capturas anteriores.
