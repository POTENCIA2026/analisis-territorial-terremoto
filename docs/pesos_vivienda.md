# Vivienda: mayor peso a la destrucción

Política vigente en `salud-presion-hospitalizacion-sin-heridos-ih`:
`Vivienda = (2 × z_destruidas + z_averiadas) / 3`.

- Destruidas: 2/3 del sector; averiadas: 1/3.
- Vivienda conserva 1/5 del compuesto antes del ajuste IPM.
- Los pesos se aplican al absoluto, per cápita y relativo, con los puntajes propios de cada versión.
- Es una decisión explícita de priorización: la destrucción recibe doble peso; no es una equivalencia estimada de costos ni un peso entrenado contra PNUD.
- PNUD sigue siendo la fuente principal y 3iS solo el respaldo; cero PNUD es válido.
- No se cambian datos, tasas, normalizaciones, anclas ni otros sectores. Educación relativa conserva el tope fijo.
- Faltantes: mantener el peso y propagar 0–100, sin reemplazar el dato ni repartir su peso.
- Si no se usa cascada en una configuración histórica, cada canal de destruidas pesa 1/3 y cada canal de averiadas 1/6; el total por tipo sigue siendo 2/3 y 1/3.

El aumento del peso no implica que suban todos los municipios. Si el puntaje de destruidas es menor que el de averiadas, el puntaje de Vivienda disminuye.

Implementación: `web/priorizacion.js`; configuración: `data/presion_salud.json`.
Auditoría contra b8be4ad9c55a823b26841c405ef9cd3c85a78a54: `docs/verificacion_pesos_vivienda.json`.
Las auditorías anteriores aíslan su cambio histórico; esta auditoría registra los resultados vigentes con los nuevos pesos.
