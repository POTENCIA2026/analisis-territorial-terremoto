# Familias afectadas: visibles, sin incidencia en el índice

En main, familias mantiene su tarjeta, conteo, tasa disponible y color, pero su peso es cero en absoluto, per cápita y relativo.

Impacto humano = (z_fallecidos + z_desaparecidos) / 2.

- Cada uno de esos dos indicadores pesa 1/2 dentro del sector. El sector sigue pesando 1/5 global.
- Familias no modifica el puntaje, límites, cobertura, sensibilidad de pesos ni ranking.
- Hay diez campos mostrados y nueve campos que intervienen en el cálculo. Los contadores de cobertura excluyen familias.
- Si falta fallecidos o desaparecidos, no se redistribuye su peso: se conserva el intervalo 0–100 del indicador faltante.
- Tener solo familias reportadas no equivale a tener evidencia puntuable.
- La cascada PNUD → 3iS, el peso 2/3 para vivienda destruida y el tope fijo de Educación no cambian.
- El ajuste por IPM permanece igual.

Estado anterior: 783cb662dc778ab4b21a7864a689ec5a1783de9c. Esta decisión no modifica el respaldo main2.
Verificación reproducible: `node scripts/auditar_familias_informativas.cjs`.
