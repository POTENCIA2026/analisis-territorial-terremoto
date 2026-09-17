# Índice sin Centros educativos

Cambio exclusivo de la rama salud-presion-hospitalizacion-sin-heridos-ih, sobre el commit 59bfbe780c91a8f79e9d6ab0fbc1b574b0095c07.

Centros educativos era la única variable de Educación en el índice con cascada. Se retira Educación del cálculo absoluto, per cápita y relativo, sus matrices, fichas, radares, rankings y comparación con necesidad de recuperación temprana. No se sustituye por un cero ni por un sector permanentemente desconocido.

Quedan cuatro dimensiones con peso 1/4:
- Impacto humano: familias, fallecidos y desaparecidos; 1/3 cada variable.
- Vivienda: destruidas y averiadas; 1/2 cada variable.
- Salud: centros afectados en absoluto/per cápita; heridos por camas generales registradas en relativo.
- Infraestructura y acceso: colapsos, acueductos y vías; 1/3 cada variable.

Hay nueve variables en cada modelo.

D = (Impacto humano + Vivienda + Salud + Infraestructura) / 4.
P = D × (1 + 0,25 × IPM/100) / 1,25.

Los puntajes internos, anclas, fuentes, denominadores y tratamiento de faltantes de los cuatro sectores permanecen iguales. Cambian sus aportes al promedio global de 1/5 a 1/4, los límites, cobertura global y rankings. La cascada PNUD → 3iS se mantiene para vivienda y Salud absoluta/per cápita. Salud relativa continúa usando heridos/camas, sin ML.

Los datos educativos originales, el inventario SIMAT y los registros históricos no se borran. Siguen disponibles en Diagnóstico territorial. La recuperación temprana publicada por UNDP/PNUD no se modifica.

La geometría de los tres radares usa cuatro ejes equidistantes y los encabezados/fórmulas leen las dimensiones activas del modelo. No hay columna vacía de Educación.

Verificación: tests/sin_educacion.test.js, prueba de las tres matrices y radares en Chromium, y scripts/auditar_sin_educacion.cjs contra el commit padre. La auditoría se guarda en docs/verificacion_sin_educacion.json.
