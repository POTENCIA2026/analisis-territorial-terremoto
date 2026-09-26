#!/usr/bin/env python3
"""Proceso principal del contenedor: publica el tablero y lo mantiene actualizado.

Sirve el tablero con nginx y, cada UPDATE_INTERVAL_HOURS, descarga las fuentes, regenera el HTML y lo
publica. Lo que se publica es siempre la última versión que pasó las validaciones: si una corrida falla,
el sitio sigue mostrando la anterior. Solo biblioteca estándar.

Disposición del volumen /data:
  state/   historial y CSV de trabajo (lo único que hay que respaldar)
  public/  lo que nginx sirve: index.html, index.html.gz, CSV crudo, status.json
  work/    carpeta temporal de cada corrida; se descarta siempre
"""
import gzip
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import fcntl  # solo Linux (el contenedor); en Windows solo se importa para las pruebas
except ImportError:  # pragma: no cover
    fcntl = None

APP = Path(os.environ.get("APP_DIR", "/app"))
DATA = Path(os.environ.get("DATA_DIR", "/data"))
SEED = Path(os.environ.get("SEED_DIR", "/seed"))
STATE, PUBLIC, WORK = DATA / "state", DATA / "public", DATA / "work"
HISTORY = "historial_indicadores_no_calculo.csv"
CURRENT = "indicadores_largo_no_calculo.csv"
STATE_FILES = (HISTORY, CURRENT, "indicadores_largo.csv")
INTERVAL = float(os.environ.get("UPDATE_INTERVAL_HOURS", "4")) * 3600
RETRY = float(os.environ.get("RETRY_MINUTES", "30")) * 60
TIMEOUT = float(os.environ.get("RUN_TIMEOUT_MINUTES", "40")) * 60
MIN_HTML_BYTES = int(os.environ.get("MIN_HTML_BYTES", str(1_000_000)))
# Una captura reemplazada puede traer menos filas (una fuente caída), pero el historial no debe encogerse mucho.
MIN_HISTORY_RATIO = 0.9
STOP = threading.Event()


class RunError(Exception):
    pass


def log(message):
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {message}", flush=True)


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def atomic_write(path, data):
    path = Path(path)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data if isinstance(data, bytes) else data.encode("utf-8"))
    os.replace(tmp, path)


def read_status():
    try:
        return json.loads((PUBLIC / "status.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def write_status(**changes):
    status = {**read_status(), **changes, "updated_at": now()}
    atomic_write(PUBLIC / "status.json", json.dumps(status, ensure_ascii=False, indent=1))
    return status


def seed_state():
    """Primer arranque: copia la captura incluida en la imagen (sin pisar nada que ya exista)."""
    STATE.mkdir(parents=True, exist_ok=True)
    for name in STATE_FILES:
        target, source = STATE / name, SEED / name
        if not target.exists() and source.exists():
            tmp = target.with_name(target.name + ".tmp")
            shutil.copy2(source, tmp)
            os.replace(tmp, target)
            log(f"Estado inicial: {name} copiado de la imagen")


def pipeline_commands(update):
    py = sys.executable
    generate = [py, str(APP / "generar_tablero_recuperacion.py"), "--input", CURRENT, "--history", HISTORY,
                "--out", "index.html", "--eda-redirect", "eda_indicadores.html"]
    if not update:
        return [generate]
    return [[py, str(APP / "actualizar_indice_terremoto.py"), "--out", "index.html"],
            [py, str(APP / "migrar_clasificacion_3is.py")], generate]


def run_command(argv, cwd):
    """Ejecuta un paso con tiempo máximo; responde a la señal de parada. Devuelve la cola de su salida."""
    log("$ " + " ".join(Path(a).name if a.startswith("/") else a for a in argv))
    out = Path(cwd) / f".salida-{int(time.time() * 1000)}.log"
    with out.open("wb") as handle:
        proc = subprocess.Popen(argv, cwd=cwd, stdout=handle, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + TIMEOUT
        while proc.poll() is None:
            if STOP.is_set() or time.monotonic() > deadline:
                proc.terminate()
                try:
                    proc.wait(15)
                except subprocess.TimeoutExpired:
                    proc.kill()
                raise RunError("interrumpido por parada del contenedor" if STOP.is_set() else f"tiempo máximo excedido ({TIMEOUT / 60:.1f} min)")
            time.sleep(0.5)
    text = out.read_text(encoding="utf-8", errors="replace")
    out.unlink(missing_ok=True)
    tail = "\n".join(text.strip().splitlines()[-40:])
    print(tail, flush=True)
    if proc.returncode != 0:
        cause = tail.splitlines()[-1].strip() if tail else "sin salida"
        raise RunError(f"{Path(argv[1]).name if len(argv) > 1 else argv[0]} terminó con código {proc.returncode}: {cause}\n{tail}")
    return tail


def count_lines(path):
    try:
        with open(path, "rb") as handle:
            return sum(1 for _ in handle)
    except OSError:
        return 0


def validate(work):
    """Comprueba que lo generado se pueda publicar. Devuelve datos para status.json."""
    html_path = Path(work) / "index.html"
    if not html_path.exists():
        raise RunError("la corrida no produjo index.html")
    size = html_path.stat().st_size
    if size < MIN_HTML_BYTES:
        raise RunError(f"index.html sospechosamente pequeño ({size} bytes)")
    text = html_path.read_text(encoding="utf-8")
    if "const DATA=" not in text or 'role="tabpanel"' not in text or "__BRAND__" in text:
        raise RunError("index.html no tiene la estructura esperada")
    latest = re.search(r'"latest":"(\d{4}-\d{2}-\d{2})"', text)
    dates = re.search(r'"dates":\[([^\]]*)\]', text)
    old_lines, new_lines = count_lines(STATE / HISTORY), count_lines(Path(work) / HISTORY)
    if old_lines and new_lines < old_lines * MIN_HISTORY_RATIO:
        raise RunError(f"el historial se encogería de {old_lines} a {new_lines} filas; no se publica")
    return {"capture_date": latest.group(1) if latest else None, "embedded_captures": len(dates.group(1).split(",")) if dates and dates.group(1) else 0,
            "html_bytes": size, "history_rows": max(new_lines - 1, 0)}


def publish(work):
    """Deja la nueva versión visible de forma atómica (el .gz primero: nginx lo sirve si el cliente lo acepta)."""
    PUBLIC.mkdir(parents=True, exist_ok=True)
    html = (Path(work) / "index.html").read_bytes()
    gz = PUBLIC / "index.html.gz.tmp"
    with gzip.open(gz, "wb", compresslevel=9) as handle:
        handle.write(html)
    os.replace(gz, PUBLIC / "index.html.gz")
    atomic_write(PUBLIC / "index.html", html)
    # El CSV crudo lo enlaza la propia página; sale del estado ya promovido, no de work (allí ya no está).
    for name, folder in (("eda_indicadores.html", Path(work)), (CURRENT, STATE)):
        if (folder / name).exists():
            tmp = PUBLIC / (name + ".tmp")
            shutil.copy2(folder / name, tmp)
            os.replace(tmp, PUBLIC / name)


def promote_state(work):
    for name in STATE_FILES:
        if (Path(work) / name).exists():
            os.replace(Path(work) / name, STATE / name)


def run_once(update=True):
    """Una corrida completa. Devuelve True si publicó una versión nueva; nunca lanza."""
    DATA.mkdir(parents=True, exist_ok=True)
    lock = (DATA / ".lock").open("w")
    try:
        if fcntl:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("Ya hay una corrida en curso; se omite esta")
        return False
    started = time.monotonic()
    write_status(state="running", last_attempt=now())
    try:
        shutil.rmtree(WORK, ignore_errors=True)
        WORK.mkdir(parents=True)
        for name in STATE_FILES:
            if (STATE / name).exists():
                shutil.copy2(STATE / name, WORK / name)
        (WORK / "data").symlink_to(APP / "data")
        for argv in pipeline_commands(update):
            run_command(argv, WORK)
        info = validate(WORK)
        promote_state(WORK)  # antes que publish: el CSV público se toma del estado
        publish(WORK)
        # Solo una actualización real cuenta como éxito: el arranque sin descarga (captura incluida en la
        # imagen) publica algo útil, pero no debe retrasar la primera descarga verdadera.
        write_status(state="idle", ok=True, error=None, duration_seconds=round(time.monotonic() - started, 1),
                     mode="actualización" if update else "arranque sin descarga", **({"last_success": now()} if update else {}), **info)
        log(f"Publicado: captura {info['capture_date']}, {info['html_bytes'] / 1e6:.1f} MB, {info['embedded_captures']} capturas incrustadas")
        return True
    except Exception as error:  # noqa: BLE001 -- cualquier fallo deja intacta la versión publicada
        message = str(error).strip() or error.__class__.__name__
        log(f"La corrida falló; se mantiene la versión publicada. {message.splitlines()[0]}")
        write_status(state="idle", ok=False, error=message[-2000:], duration_seconds=round(time.monotonic() - started, 1))
        return False
    finally:
        shutil.rmtree(WORK, ignore_errors=True)
        if fcntl:
            fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()


def seconds_since(iso):
    try:
        return (datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds()
    except (TypeError, ValueError):
        return float("inf")


def healthy():
    """Sano = hay página publicada y el último éxito no es más viejo que tres intervalos."""
    status = read_status()
    return (PUBLIC / "index.html").exists() and seconds_since(status.get("last_success")) < 3 * INTERVAL


def wait(seconds, nginx=None):
    """Espera interrumpible; si nginx muere, corta para que el contenedor se reinicie."""
    end = time.monotonic() + seconds
    while not STOP.is_set() and time.monotonic() < end:
        if nginx is not None and nginx.poll() is not None:
            log("nginx terminó; se cierra el contenedor para que Docker lo reinicie")
            STOP.set()
            return
        STOP.wait(min(5, max(0.1, end - time.monotonic())))


def main():
    if "--healthcheck" in sys.argv:
        sys.exit(0 if healthy() else 1)
    signal.signal(signal.SIGTERM, lambda *_: STOP.set())
    signal.signal(signal.SIGINT, lambda *_: STOP.set())
    PUBLIC.mkdir(parents=True, exist_ok=True)
    seed_state()
    nginx = None
    if os.environ.get("NO_NGINX") != "1":
        Path("/tmp/nginx").mkdir(parents=True, exist_ok=True)
        nginx = subprocess.Popen(["nginx", "-e", "/dev/stderr", "-g", "daemon off;"])
    try:
        if not (PUBLIC / "index.html").exists() and (STATE / CURRENT).exists():
            log("Sin página publicada: se genera desde la captura incluida, sin descargar")
            run_once(update=False)
        while not STOP.is_set():
            status = read_status()
            age = seconds_since(status.get("last_attempt") if status.get("ok") is False else status.get("last_success"))
            due = (RETRY if status.get("ok") is False else INTERVAL) - age
            if due > 0:
                log(f"Próxima actualización en {due / 60:.0f} min")
                wait(due, nginx)
                continue
            run_once(update=True)
            wait(60, nginx)  # evita bucles apretados si el reloj o el estado fallan
    finally:
        if nginx is not None and nginx.poll() is None:
            nginx.send_signal(signal.SIGQUIT)
            try:
                nginx.wait(20)
            except subprocess.TimeoutExpired:
                nginx.kill()
    log("Detenido")


if __name__ == "__main__":
    main()
