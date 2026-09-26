# Tablero territorial del terremoto, autocontenido: nginx + el actualizador de datos.
# Solo biblioteca estándar de Python: no hay dependencias que instalar.
FROM python:3.12-alpine

RUN apk add --no-cache nginx tini tzdata \
 && adduser -D -u 10001 tablero \
 && mkdir -p /data /seed /tmp/nginx \
 && chown -R tablero:tablero /data

WORKDIR /app
COPY actualizar_indice_terremoto.py generar_tablero_recuperacion.py migrar_clasificacion_3is.py deploy/ejecutor.py ./
COPY web ./web
COPY data ./data
COPY docs ./docs
COPY historial_indicadores_no_calculo.csv indicadores_largo_no_calculo.csv /seed/
COPY deploy/nginx.conf /etc/nginx/nginx.conf

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UPDATE_INTERVAL_HOURS=4 TZ=America/Bogota
USER tablero
EXPOSE 8080
VOLUME /data

# Sano = nginx responde y hubo una actualización correcta en los últimos tres intervalos.
HEALTHCHECK --interval=60s --timeout=10s --start-period=300s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz && python /app/ejecutor.py --healthcheck || exit 1

ENTRYPOINT ["/sbin/tini", "--", "python", "/app/ejecutor.py"]
