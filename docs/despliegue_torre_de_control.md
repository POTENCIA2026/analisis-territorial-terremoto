# Despliegue en el servidor de Torre de Control

El tablero corre en un contenedor Docker propio, en el mismo servidor que Torre de Control, y Nginx lo
publica en el mismo dominio bajo `/tablero-terremoto/`. Sustituye al sitio de Netlify: la sección
«Análisis Territorial» de la plataforma lo embebe en un iframe del mismo origen.

```
Internet ──HTTPS──▶ Nginx (host) ──┬──▶ /api/*               ──▶ 127.0.0.1:8001  contenedor `app` de Torre
                                   ├──▶ /tablero-terremoto/  ──▶ 127.0.0.1:8002  contenedor `tablero` (este repo)
                                   └──▶ resto                ──▶ build estático del frontend de Torre
```

## Qué hace el contenedor

- **Sirve** la página con nginx (sin privilegios). `index.html` pesa ~95 MB y se publica ya comprimido
  (~7 MB); también sirve `data/`, `docs/` y el CSV crudo, que la página enlaza con rutas relativas.
- **Se actualiza solo** cada `UPDATE_INTERVAL_HOURS` (4): descarga las fuentes, regenera el HTML y lo publica.
  Reemplaza al flujo de GitHub Actions + Netlify.
- **Nunca publica algo roto.** Cada corrida trabaja en una copia y solo publica si pasa las validaciones
  (HTML con la estructura esperada, historial que no se encoge más de un 10 %). Si una fuente no responde,
  la corrida se cancela (no se publica un inventario incompleto) y el sitio sigue mostrando la versión
  anterior; se reintenta a los 30 minutos.
- **Historial acotado en la página.** El historial completo se conserva en el volumen, pero al HTML solo
  se incrustan las últimas 30 capturas y, de las anteriores, la última de cada semana. Sin este tope la
  página crecería ~5 MB por día. El selector «Fecha de reporte» ofrece esas capturas.

## Estado y decisiones

- **Volumen Docker `tablero_data`** (`/data`): `state/` (historial y CSV de trabajo, lo único que hay que
  respaldar) y `public/` (lo que se sirve). Al primer arranque se siembra con la captura incluida en la
  imagen y se publica de inmediato, sin esperar la descarga.
- **Sin base de datos, a propósito:** el flujo es por lotes (CSV → HTML) y nada consulta datos en vivo.
  Si Torre necesita consultar los puntajes, el contenedor puede cargar el CSV largo a una tabla de Postgres
  al terminar cada corrida y la API de Torre servirla; no hace falta rehacer nada de lo actual.
- **Seguridad:** usuario sin privilegios, sistema de archivos de solo lectura, sin capacidades, solo
  `127.0.0.1`. La página lleva su propia política (`default-src 'none'`, sin peticiones de red permitidas,
  `frame-ancestors 'self'`): solo el mismo origen (Torre) puede enmarcarla.

## Puesta en marcha

```bash
git clone <url-de-este-repo> /opt/tablero-terremoto && cd /opt/tablero-terremoto
docker compose up -d --build
curl -s http://127.0.0.1:8002/status.json      # "ok": true tras la primera descarga (~1-2 min)
```

Si 8002 está ocupado, cambia solo el número de la izquierda en `ports:` de `docker-compose.yml` y
`proxy_pass` en la configuración de Nginx de Torre.

## Cambios en Torre de Control

Están en [`deploy/torre-de-control/torre-de-control.patch`](../deploy/torre-de-control/torre-de-control.patch).
Se aplican desde la raíz del repositorio de Torre (`git apply --check` primero):

```bash
cd /ruta/a/ControlTower
git apply --check -p1 /ruta/a/analisis-territorial-terremoto/deploy/torre-de-control/torre-de-control.patch
git apply -p1 /ruta/a/analisis-territorial-terremoto/deploy/torre-de-control/torre-de-control.patch
```

| Archivo de Torre | Cambio |
| --- | --- |
| `deploy/nginx/controltower.conf` | `location ^~ /tablero-terremoto/` hacia `127.0.0.1:8002`, con sus propios `add_header` |
| `deploy/nginx/security-headers.conf` | `frame-src` pasa de la URL de Netlify a `'self'` |
| `frontend/src/pages/AnalisisTerritorial*Page.tsx` | el iframe apunta a `/tablero-terremoto/` (o a `VITE_TABLERO_URL`) |
| `frontend/vite.config.ts` | en desarrollo, Vite reenvía `/tablero-terremoto` al contenedor |
| `DEPLOYMENT.md` | sección 14 con la instalación, verificación, backup y problemas comunes |

Dos detalles que no son obvios:

1. **El `location` del tablero define sus propios `add_header`.** Por la herencia de Nginx, con al menos
   uno propio deja de heredar los del `server {}`. Es necesario: los de Torre (`X-Frame-Options: DENY`,
   `script-src 'self'`) impedirían enmarcar el tablero y bloquearían sus scripts en línea.
2. **`frame-src` debe recargarse en el snippet instalado** (`/etc/nginx/snippets/...`), no solo en el repo:
   sin eso el iframe queda en blanco y la consola muestra la violación de CSP.

## Cambio de Netlify a este contenedor (orden recomendado)

1. Levantar el contenedor y esperar `"ok": true` en `status.json`.
2. Aplicar el parche en Torre, copiar el snippet de cabeceras, `nginx -t && systemctl reload nginx`, y
   reconstruir el frontend de Torre.
3. Comprobar `https://<dominio>/tablero-terremoto/` y la sección «Análisis Territorial» (también su enlace público).
4. Solo entonces, dar de baja Netlify (y GitHub Pages, si se publica por ahí). El `schedule` de
   `.github/workflows/actualizar.yml` ya está comentado en este repo: sin eso seguiría haciendo un commit de
   ~100 MB cada 4 h que ya nadie usa. Las pruebas siguen corriendo en cada push y con «Run workflow».
   **Ojo:** ese comentario surte efecto al subir el cambio a `main`; desde ese momento Netlify deja de
   actualizarse, así que súbelo después del paso 3, no antes.

**Marcha atrás:** revertir el parche en Torre y recargar Nginx; el iframe vuelve a apuntar a la dirección anterior.

## Operación

```bash
docker compose ps                              # estado y salud
docker compose logs --tail 60 tablero          # qué hizo la última corrida
curl -s http://127.0.0.1:8002/status.json      # last_success, capture_date, error si falló
git pull && docker compose up -d --build       # actualizar a una versión nueva (el historial se conserva)
./deploy/respaldar.sh /ruta/de/backups         # respaldo del historial (añadir al cron del backup de Torre)
```

`status.json`: `ok`, `last_success` (última descarga correcta), `last_attempt`, `capture_date` (fecha de la
captura publicada), `embedded_captures`, `history_rows`, `html_bytes` y, si falló, `error` (la causa va en
la primera línea). El contenedor se marca *unhealthy* si pasan más de tres intervalos sin una descarga correcta.

| Variable | Por defecto | Efecto |
| --- | --- | --- |
| `UPDATE_INTERVAL_HOURS` | 4 | cada cuánto se actualiza |
| `RETRY_MINUTES` | 30 | espera tras una corrida fallida |
| `RUN_TIMEOUT_MINUTES` | 40 | tiempo máximo de cada paso |

Restaurar un respaldo: `docker compose down`, extraer el `.tar.gz` en `/data/state` del volumen
(`docker run --rm -v tablero-terremoto_tablero_data:/data -v "$PWD":/b alpine sh -c "cd /data/state && tar -xzf /b/<archivo>"`)
y `docker compose up -d`.
