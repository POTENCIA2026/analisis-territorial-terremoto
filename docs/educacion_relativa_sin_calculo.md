# Corrección: solo se desactiva el cálculo educativo relativo

Rama salud-presion-hospitalizacion-sin-heridos-ih. Referencia previa a la eliminación equivocada: 59bfbe780c91a8f79e9d6ab0fbc1b574b0095c07.

Se restablecen exactamente los índices absoluto y per cápita, con Educación incluida. Son cinco dimensiones y diez variables. Cada sector pesa 1/5.

Únicamente se desactiva la tasa/puntaje relativo de Centros educativos (PNUD y su respaldo 3iS). No se elimina la dimensión, ni el conteo original, ni SIMAT, ni la consulta del diagnóstico. Educación permanece como eje y columna, sin punto ni puntaje relativo. Se señala ausencia de cálculo; no un cero observado.

La dimensión relativa conserva el intervalo 0–100 por no tener puntaje. Su peso 1/5 no se redistribuye a las otras dimensiones. Por ello cambian el límite documentado global, cobertura y ranking relativo respecto del modelo con el cálculo educativo habilitado. Los puntajes y denominadores de Salud y de los otros sectores permanecen idénticos.

El retiro completo de Educación y la ponderación 1/4 del cambio anterior se revierten. Se conserva la cascada PNUD → 3iS y heridos solo en Salud relativa.

Verificación: igualdad exacta de absoluto y per cápita contra el commit de referencia, igualdad de los otros cuatro sectores relativos, conservación de inventario y cinco ejes en los tres radares. Informe: docs/verificacion_educacion_relativa.json.
