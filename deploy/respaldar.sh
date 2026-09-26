#!/bin/sh
# Respalda el estado del tablero (el historial de capturas; lo demás se regenera solo).
# Uso, desde la carpeta del repositorio:   ./deploy/respaldar.sh [carpeta-destino]
# Prográmalo por cron junto al backup de la base de datos de Torre de Control y copia el resultado fuera del servidor.
set -eu
destino="${1:-.}"
archivo="$destino/tablero-estado-$(date +%F).tar.gz"
docker compose exec -T tablero tar -C /data/state -cf - . | gzip > "$archivo"
# Comprueba que el archivo se pueda leer y no esté vacío antes de darlo por bueno.
tar -tzf "$archivo" > /dev/null
echo "Respaldo listo: $archivo ($(du -h "$archivo" | cut -f1))"
