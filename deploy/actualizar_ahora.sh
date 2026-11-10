#!/bin/sh
# Fuerza una actualización inmediata del tablero, sin esperar el ciclo de UPDATE_INTERVAL_HOURS (4 horas
# por defecto) ni reiniciar el contenedor. Para después de un `docker compose up -d --build`: por sí solo,
# ese comando NO regenera la página -- si ya había una publicada en el volumen, sigue sirviéndose tal cual
# hasta el próximo ciclo. Los visitantes ven la página anterior en todo momento hasta que la nueva corrida
# termine y pase sus validaciones (ver deploy/ejecutor.py); si falla, no se publica nada y este script
# termina con código distinto de cero.
# Uso, desde la carpeta del repositorio, con el contenedor ya levantado:   ./deploy/actualizar_ahora.sh
# Si tu usuario no está en el grupo docker, antepón sudo:                 sudo ./deploy/actualizar_ahora.sh
set -eu
docker compose exec tablero python /app/ejecutor.py --run-now
echo "Listo. Estado: docker compose exec tablero wget -qO- http://127.0.0.1:8080/status.json"
