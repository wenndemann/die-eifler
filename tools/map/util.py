"""Kleinwerkzeuge der Welt-Pipeline: atomares Schreiben, gzip (mtime=0), Fortschritt, Status."""
import gzip
import hashlib
import json
import os
import shutil
import sys
import time


def atomar_schreiben(pfad, daten):
    os.makedirs(os.path.dirname(pfad) or ".", exist_ok=True)
    tmp = pfad + ".tmp"
    with open(tmp, "wb") as f:
        f.write(daten)
    os.replace(tmp, pfad)


def gz_schreiben(pfad, daten):
    """gzip mit mtime=0: gleiche Daten -> gleiche Datei."""
    atomar_schreiben(pfad, gzip.compress(daten, compresslevel=9, mtime=0))


def json_schreiben(pfad, obj, indent=None):
    atomar_schreiben(pfad, json.dumps(obj, ensure_ascii=False, indent=indent,
                                      separators=None if indent else (",", ":")).encode("utf-8"))


def json_lesen(pfad, standard=None):
    try:
        with open(pfad, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return standard


def sha256_entpackt(pfad):
    """sha256 über den entpackten Inhalt (bei .gz nach dem Entpacken)."""
    h = hashlib.sha256()
    op = gzip.open if pfad.endswith(".gz") else open
    with op(pfad, "rb") as f:
        while True:
            b = f.read(1 << 20)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def loeschen(pfad):
    try:
        if os.path.isdir(pfad):
            shutil.rmtree(pfad)
        else:
            os.remove(pfad)
    except OSError:
        pass


class Roh:
    """Rohdaten nach Gebrauch löschen oder (--archiv) dorthin verschieben."""
    archiv = None
    version = ""

    @classmethod
    def entsorgen(cls, pfad):
        if not os.path.exists(pfad):
            return
        if cls.archiv:
            ziel = os.path.join(cls.archiv, cls.version, os.path.basename(os.path.dirname(pfad)),
                                os.path.basename(pfad))
            os.makedirs(os.path.dirname(ziel), exist_ok=True)
            try:
                shutil.move(pfad, ziel)
                return
            except OSError:
                pass
        loeschen(pfad)


class Fortschritt:
    """Zeilenausgabe: Stufe, Kachel x/y, MB geladen, geschätzte Restzeit."""

    def __init__(self, name, gesamt):
        self.name, self.gesamt, self.n = name, gesamt, 0
        self.t0 = time.time()
        self.mb = 0.0
        self.letzte = 0.0

    def laden(self, bytes_):
        self.mb += bytes_ / 1e6

    def schritt(self, info="", n=1, stumm=False):
        self.n += n
        jetzt = time.time()
        if stumm or (jetzt - self.letzte < 2 and self.n < self.gesamt):
            return
        self.letzte = jetzt
        dt = jetzt - self.t0
        rest = dt / self.n * (self.gesamt - self.n) if self.n else 0
        print(f"[{self.name}] {self.n}/{self.gesamt}  {info}  geladen {self.mb:.0f} MB  "
              f"Rest ~{int(rest // 60)}:{int(rest % 60):02d}", flush=True)
        sys.stdout.flush()


def umgebung_proxy():
    """Im Container (/root/.ccr) fehlende Proxy-/Zertifikatsvariablen setzen; sonst nichts."""
    ca = "/root/.ccr/ca-bundle.crt"
    if not os.path.isdir("/root/.ccr") or not os.path.exists(ca):
        return
    os.environ.setdefault("CURL_CA_BUNDLE", ca)
    os.environ.setdefault("SSL_CERT_FILE", ca)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", ca)
    p = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if p:
        os.environ.setdefault("GDAL_HTTP_PROXY", p)
