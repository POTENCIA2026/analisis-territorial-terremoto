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
./deploy/actualizar_ahora.sh                   # forzar una actualización ya, sin esperar el ciclo de 4h
./deploy/respaldar.sh /ruta/de/backups         # respaldo del historial (añadir al cron del backup de Torre)
```

**`git pull && docker compose up -d --build` por sí solo no actualiza la página.** El contenedor arranca
sirviendo lo que ya estaba publicado en el volumen y espera a su próximo ciclo de `UPDATE_INTERVAL_HOURS`
antes de regenerar — a propósito, para no volver a descargar todo en cada reinicio. Después de desplegar
código nuevo, corre `./deploy/actualizar_ahora.sh` para publicar de inmediato (equivale a
`docker compose exec tablero python /app/ejecutor.py --run-now`: no reinicia nginx ni el contenedor, y si
ya hay una corrida en marcha simplemente desiste en vez de pisarla). Los visitantes siguen viendo la página
anterior durante la corrida; solo cambia si la nueva pasa sus validaciones.

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

## Despliegue automático (GitHub Actions)

Cada push a `main` que toque código o datos (ver el filtro `paths` de
[`.github/workflows/desplegar.yml`](../.github/workflows/desplegar.yml)) corre las pruebas en un runner de
GitHub y, solo si pasan, hace exactamente los mismos pasos manuales de arriba: `git pull` + `docker compose
up -d --build` + forzar la actualización.

**El job de despliegue corre en un runner propio, instalado en el servidor mismo** (`runs-on:
[self-hosted, tablero-terremoto-prod]`), no en la infraestructura de GitHub. El servidor solo es
alcanzable por Azure Bastion -- no acepta SSH entrante desde internet -- así que un runner de GitHub no
tendría ninguna ruta de red hasta él. El runner propio lo resuelve al revés: es él quien abre una conexión
saliente hacia GitHub para pedir trabajo, lo que funciona a través de cualquier firewall/NAT sin abrir
ningún puerto entrante. No hace falta Bastion, ni una app de Azure AD, ni credenciales de Azure en GitHub.

**Por qué esto es razonable acá, y cuándo dejaría de serlo:** un runner propio ejecuta el código que le
mande el workflow que lo invoca, así que normalmente es más seguro conectarse por SSH desde un runner de
GitHub que instalar uno propio en una máquina con secretos de producción. Esto se evalúa distinto porque
`desplegar.yml` **solo** escucha `push` a `main` y `workflow_dispatch` -- nunca `pull_request` -- así que
solo puede dispararse con código que ya pasó por algo que exigía permiso de escritura sobre el repositorio
(un push directo, o un PR que alguien con permiso de fusión aprobó). Si este repositorio se vuelve público,
o si algún día se agrega un trigger de `pull_request` a cualquier workflow de este repo, hay que revisar
esto de nuevo: un fork malicioso podría entonces alcanzar un runner con acceso real al servidor.

### Preparar el servidor (una sola vez)

1. **Créale primero un usuario propio, de privilegios mínimos** -- no tu usuario, no root. Su única
   capacidad debe ser correr `docker compose` y leer el checkout del repo (registra el runner bajo esta
   cuenta, no bajo tu propio login):
   ```bash
   sudo useradd -m -s /bin/bash github-runner
   sudo usermod -aG docker github-runner
   ```

2. **Registra el runner.** El registro a nivel de repositorio (Settings del repo → Actions → Runners →
   «New self-hosted runner», con `--url https://github.com/POTENCIA2026/analisis-territorial-terremoto`)
   puede no funcionar según la política de esta organización -- si da `404 Not Found` incluso con un token
   recién generado, usa el registro a **nivel de organización** en su lugar: Settings de la organización
   → Actions → Runners → «New self-hosted runner» (`--url https://github.com/POTENCIA2026`, sin ruta de
   repo). La sintaxis es la misma; solo cambia el alcance del `--url` y de dónde sale el token:
   El registro en sí (`./config.sh`) no necesita privilegios -- se corre como `github-runner`, no como
   root/tu usuario, para que los archivos de credenciales del runner queden de ese dueño:
   ```bash
   sudo -u github-runner -i
   mkdir actions-runner && cd actions-runner
   # pega aquí el curl/tar que te dé la página de GitHub (cambia con cada versión del runner)
   ./config.sh --url <url-del-paso-anterior> --token <el-token-que-dio-github> \
     --labels tablero-terremoto-prod --unattended
   exit   # vuelve a tu propio usuario
   ```
   Instalar el servicio sí necesita privilegios, así que esto corre con `sudo` desde tu propia sesión, no
   dentro de la de `github-runner` (y especifica a qué usuario correrlo):
   ```bash
   cd /home/github-runner/actions-runner
   sudo ./svc.sh install github-runner
   sudo ./svc.sh start
   ```
   **Si registraste a nivel de organización, hay un paso extra obligatorio.** Un runner de organización
   es visible para *todos* los repositorios de la organización por defecto -- no solo este. En Settings
   de la organización → Actions → Runner groups → el grupo donde quedó este runner (`Default` si no
   elegiste otro al registrarlo): restringe su acceso a solo `analisis-territorial-terremoto`, a menos que
   otro runner ya dependa de que ese grupo esté abierto a todos los repos (en ese caso, créale un grupo
   nuevo y exclusivo a este runner). Sin este paso, cualquier otro repositorio de la organización -- con
   su propio nivel de confianza, no necesariamente el mismo que este -- podría apuntar a la misma etiqueta
   (`tablero-terremoto-prod`, o incluso solo `self-hosted`) y ejecutar código en este runner, en el mismo
   servidor de producción. Esto es lo único que hace que el razonamiento de más arriba (nadie ajeno puede
   alcanzar este runner sin permiso de escritura) siga siendo cierto con un runner de organización.

3. **Confirma que `github-runner` puede correr `docker compose` sin `sudo`** (ya cubierto por el
   paso 1 -- una sesión de servicio no puede responder a un prompt de contraseña):
   ```bash
   sudo -u github-runner docker ps
   ```

### Configurar el repositorio en GitHub

`Settings → Secrets and variables → Actions → Variables` (esto es configuración, no secretos -- nada
sensible viaja en este despliegue, por eso no hace falta la pestaña Secrets):

| Nombre | Valor |
| --- | --- |
| `DEPLOY_PATH` | ruta absoluta del repo en el servidor (ej. `/home/info/analisis-territorial-terremoto`) -- el checkout persistente, el mismo que ya usan los comandos manuales de arriba, no uno nuevo creado por el runner |
| `TABLERO_PUBLIC_URL` | opcional, por defecto `https://torre.potencia.com.co/tablero-terremoto` -- usada solo para el chequeo final, que sí corre en un runner de GitHub (es HTTPS público normal, ajeno al problema de SSH/Bastion) |

### Verificar

Dispara el workflow a mano antes de confiar en que el próximo push lo haga bien: pestaña **Actions** →
«Desplegar en el servidor» → **Run workflow**. Si el job `desplegar` nunca arranca (se queda «Queued»),
el runner no está corriendo o su etiqueta no coincide (`sudo ./svc.sh status`, en la carpeta donde se
instaló). Si falla en «Verificar el tablero públicamente», el despliegue en sí probablemente funcionó pero
Nginx/el dominio público tienen un problema aparte (ver «Problemas comunes» más abajo, o la configuración
de Torre en la sección anterior de este documento).

### Qué pasa si falla

- **Las pruebas fallan (`probar`):** no se toca el servidor en absoluto. El servidor sigue sirviendo lo
  que ya tenía publicado.
- **`git merge --ff-only` o `docker compose up -d --build` fallan:** el paso se detiene ahí (el shell de
  `run:` corta en el primer error), el servidor queda con el contenedor viejo corriendo sin interrupciones
  -- un `--ff-only` nunca reescribe nada, así que esto no puede dejar el checkout a medias.
- **Solo falla forzar la actualización de datos (`--run-now`):** el despliegue se considera exitoso de
  todas formas (código nuevo corriendo) y queda un aviso (`::warning::`) visible en el resumen del job; el
  propio contenedor reintenta esa actualización cada 30 minutos sin intervención.
