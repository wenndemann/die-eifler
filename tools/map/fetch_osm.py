#!/usr/bin/env python3
"""Holt OpenStreetMap-Daten für die Karten-Bbox per Overpass und cacht sie in raw/osm_<id>.json.

Kartendaten © OpenStreetMap-Mitwirkende, ODbL.
Aufruf: python3 tools/map/fetch_osm.py [--map ID] [--endpoint URL]
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_map import map_config  # noqa: E402

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def query(bbox):
    s, w, n, e = bbox[1], bbox[0], bbox[3], bbox[2]
    b = f"({s},{w},{n},{e})"
    return f"""[out:json][timeout:180];
(
  way["natural"="water"]{b};
  relation["natural"="water"]{b};
  way["waterway"~"^(river|stream|canal|dam|weir)$"]{b};
  relation["waterway"="river"]{b};
  way["landuse"="reservoir"]{b};
  way["natural"="heath"]{b};
  relation["natural"="heath"]{b};
  way["natural"~"^(wetland|bog|moor)$"]{b};
  relation["natural"~"^(wetland|bog|moor)$"]{b};
  way["landuse"="quarry"]{b};
  relation["landuse"="quarry"]{b};
  node["place"~"^(city|town|village|hamlet)$"]["name"]{b};
);
out geom;"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="monschau-rursee")
    ap.add_argument("--endpoint", action="append")
    args = ap.parse_args()
    meta = map_config(args.map)
    data = urllib.parse.urlencode({"data": query(meta["bbox"])}).encode()
    out = os.path.join(HERE, "raw", f"osm_{meta['id']}.json")
    for attempt in range(6):
        for ep in args.endpoint or ENDPOINTS:
            try:
                req = urllib.request.Request(ep, data=data, headers={"User-Agent": "die-eifeler-mapbuild/1.0"})
                with urllib.request.urlopen(req, timeout=240) as r:
                    body = r.read()
                js = json.loads(body)
                if "remark" in js and not js.get("elements"):
                    raise RuntimeError(js["remark"])
                os.makedirs(os.path.dirname(out), exist_ok=True)
                with open(out, "wb") as f:
                    f.write(body)
                print(f"{len(js['elements'])} Elemente von {ep} -> {out}")
                return
            except Exception as ex:  # noqa: BLE001
                print(f"{ep}: {str(ex)[:120]}")
        time.sleep(10 * (attempt + 1))
    sys.exit("Keine Overpass-Instanz erreichbar.")


if __name__ == "__main__":
    main()
