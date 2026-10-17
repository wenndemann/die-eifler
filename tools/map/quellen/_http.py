"""Gemeinsame Download-Hilfen für die Höhenmodell-Adapter (nur Standardbibliothek).

Proxy und CA-Bundle kommen aus der Umgebung (HTTPS_PROXY, SSL_CERT_FILE); fehlt SSL_CERT_FILE und gibt es das
Container-Bundle, wird es benutzt.
"""
import json
import os
import ssl
import time
import urllib.error
import urllib.request

UA = "die-eifler-kartenbau/1 (+https://github.com/; Hoehenmodell-Adapter)"
CA_CONTAINER = "/root/.ccr/ca-bundle.crt"


def _ctx():
    cafile = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    if not cafile and os.path.exists(CA_CONTAINER):
        cafile = CA_CONTAINER
    return ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()


def _open(url, timeout, header=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(header or {})})
    return urllib.request.urlopen(req, timeout=timeout, context=_ctx())


def mit_wiederholung(fn, versuche=5, pause=2.0):
    """Ruft fn() bis zu `versuche`-mal auf, Wartezeit verdoppelt sich. 404 wird nicht wiederholt."""
    for n in range(versuche):
        try:
            return fn()
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 403, 404, 410):
                raise
            letzte = e
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            letzte = e
        if n < versuche - 1:
            time.sleep(pause * (2 ** n))
    raise letzte


def text(url, timeout=120, versuche=5):
    def f():
        with _open(url, timeout) as r:
            return r.read()
    return mit_wiederholung(f, versuche)


def herunterladen(url, ziel, timeout=120, versuche=5):
    """Lädt url nach ziel (über ziel + '.part', dann atomar umbenannt). Vorhandene Datei: nichts tun."""
    if os.path.exists(ziel) and os.path.getsize(ziel) > 0:
        return ziel
    os.makedirs(os.path.dirname(os.path.abspath(ziel)), exist_ok=True)
    part = ziel + ".part"

    def f():
        with _open(url, timeout) as r, open(part, "wb") as out:
            erwartet = r.headers.get("Content-Length")
            n = 0
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                out.write(b)
                n += len(b)
            if erwartet is not None and n != int(erwartet):
                raise OSError(f"unvollständig: {n} von {erwartet} Bytes")
        os.replace(part, ziel)
        return ziel
    try:
        return mit_wiederholung(f, versuche)
    finally:
        if os.path.exists(part):
            os.remove(part)


def index_cache(pfad, erzeuge, max_alter_tage=30):
    """Lädt einen Index aus der JSON-Datei `pfad`; ist sie nicht da oder zu alt, wird `erzeuge()` aufgerufen."""
    try:
        if time.time() - os.path.getmtime(pfad) < max_alter_tage * 86400:
            with open(pfad, encoding="utf-8") as f:
                return json.load(f)
    except (OSError, ValueError):
        pass
    daten = erzeuge()
    os.makedirs(os.path.dirname(os.path.abspath(pfad)), exist_ok=True)
    tmp = pfad + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(daten, f, separators=(",", ":"))
    os.replace(tmp, pfad)
    return daten


def km_kacheln(bounds, schritt=1000):
    """Alle Kachelecken (E, N) eines `schritt`-Meter-Gitters (Ecke unten links), die bounds schneiden."""
    e0, n0, e1, n1 = bounds
    ea, eb = int(e0 // schritt), int((e1 - 1e-6) // schritt)
    na, nb = int(n0 // schritt), int((n1 - 1e-6) // schritt)
    return [(e * schritt, n * schritt) for e in range(ea, eb + 1) for n in range(na, nb + 1)]


def standard_cache():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "arbeit", "index")
