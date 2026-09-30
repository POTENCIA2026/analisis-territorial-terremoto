# Educación: matrícula en sedes con daño crítico

Rama `educacion-matricula-critica`, creada desde `practicante/main`, commit
`c66aa361fb713fdaf741e0c0ceedf9c5798bb6bb`. No incorpora la pestaña experimental
Educación e infancia ni sus escenarios. Los otros cuatro sectores no cambian.

## Qué se añade

Matrícula de las sedes oficiales que MEN clasifica como **colapso total,
colapso parcial o riesgo inminente de colapso**, sumada una sola vez por código
DANE de sede y municipio explícito. No se deduce el municipio del prefijo del
código escolar. No se suman MEN, SIMAT y otras fuentes sobre la misma sede.

Es una medida de la población escolar vinculada a infraestructura crítica.
No demuestra que esos estudiantes estén sin clases, que todos los espacios de
la sede estén destruidos o que los daños reportados sean un censo exhaustivo.

## Cálculo

| Vista | Valor del nuevo indicador antes de normalizar |
| --- | --- |
| Total | Estudiantes matriculados en sedes con daño crítico |
| Per cápita | Estudiantes en sedes críticas × 10.000 / población municipal DANE del año de la captura |
| Relativa | La misma tasa por 10.000 habitantes; no porcentaje de alumnos ni cociente sobre sedes |

En las tres vistas, `z = 100 × valor / máximo del mismo indicador en el universo`.
El cero explícito conserva cero. Buscar u ocultar departamentos no cambia la
referencia; cambiar de universo sí. La tasa poblacional no se recorta a 1.

`Educación = 0,5 × puntaje de centros afectados + 0,5 × puntaje de matrícula crítica`.

Esta asignación es un supuesto experimental explícito, no un peso estimado.
Conserva el indicador existente y el peso total de Educación (1/5). Los centros
mantienen la cascada PNUD → 3iS y, en relativo, su cociente previo sobre sedes,
con tope fijo de 1. La matrícula crítica siempre procede de MEN. Ambos componentes
pueden estar correlacionados y no constituyen validaciones independientes.

Un municipio sin reporte MEN queda **sin dato**, no en cero. Si MEN reporta sedes
pero ninguna es crítica, el cero significa **ninguna sede crítica en ese reporte**.
Una matrícula crítica faltante o daño sin clasificar invalida ese agregado.
El peso faltante no se reparte: conserva el intervalo del modelo. Una población
ausente, duplicada, no positiva o de otro año impide calcular la tasa.

## Fuentes y corte

- `MEN Sedes escolares afectadas 20260921.xlsx`, hoja `Sheet1`: D municipio,
  J sede, AM matrícula total, AP daño. El corte 21/09/2026 se infiere del nombre
  del archivo; no es una fecha de inspección comprobada ni acredita la fecha
  independiente de matrícula. Se incorpora desde capturas del 21/09/2026;
  no se rellena hacia atrás. Capturas posteriores conservan este mismo corte MEN
  hasta recibir otro archivo, sin suponer una actualización automática.
- `SIMAT_Primera_Infancia_5_Departamentos.xlsx`, hoja `Sedes_5_Departamentos`:
  A departamento y C municipio, enlazados a DIVIPOLA mediante nombres inequívocos
  y equivalencias explícitas. `Resumen` declara Base Nación SIMAT julio 2026.
  Solo delimita el nuevo ámbito: no se usa su matrícula en este indicador.
- `data/poblacion_relativa.json`: proyecciones DANE ya utilizadas por el tablero.

Se exportan agregados municipales y huellas SHA-256 en
`data/matricula_critica.json`, sin libros originales ni datos de estudiantes.

## Nuevo universo territorial

| Departamento | Municipios |
| --- | ---: |
| Caldas | 27 |
| Chocó | 31 |
| Quindío | 12 |
| Risaralda | 14 |
| Valle del Cauca | 42 |
| **Total** | **126** |

Se selecciona como **Cinco departamentos**. Su padrón procede de la referencia
municipal DANE ya incorporada al tablero y coincide con los municipios del
inventario SIMAT recibido. No depende del indicador MEN. Incluye municipios
sin daño reportado; pertenecer al ámbito no se contabiliza como afectación.
MEN aporta el nuevo indicador en 121. Acandí, Nuquí, San José del Palmar,
Balboa (Risaralda) y Mistrató no tienen reporte MEN en este lote.
Se mantienen los otros dos universos y su selección predeterminada.

## Reproducir y comprobar

```powershell
python scripts/preparar_matricula_critica.py "RUTA/DEL/LOTE"
python -m unittest discover -s tests
node --test tests/*.test.js
python generar_tablero_recuperacion.py
```

Control nacional del lote MEN: 5.537 sedes únicas, 434 municipios,
1.010 sedes críticas y 187.505 estudiantes en ellas. No es el total exclusivo
de los cinco departamentos. El padrón SIMAT contiene 7.023 sedes únicas.

Ejemplos del numerador MEN: Pereira 23.859, Quibdó 12.464, Dosquebradas 2.435,
Atrato 774, Alcalá 12, Trujillo 1.276, Cali 0. No sustituir estos valores por
la matrícula SIMAT de las mismas sedes: son cortes distintos.
