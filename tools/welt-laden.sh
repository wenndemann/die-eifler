#!/usr/bin/env bash
# Fertige Weltdaten aus dem GitHub-Release laden (gerechnet von .github/workflows/weltdaten.yml), statt sie mit
# npm run setup neu zu rechnen. Aufruf: tools/welt-laden.sh [nideggen|nordeifel]  (Standard nideggen)
set -euo pipefail
GEBIET="${1:-nideggen}"
REPO="${WELT_REPO:-wenndemann/die-eifler}"
WURZEL="$(cd "$(dirname "$0")/.." && pwd)"
ZIEL="${WELT_DATEN:-$WURZEL/welt-daten}"
URL="https://github.com/$REPO/releases/download/welt-daten-$GEBIET/welt-daten-$GEBIET.tar.gz"
mkdir -p "$ZIEL"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
echo "Lade $URL"
curl -fL --retry 4 --retry-delay 2 -o "$TMP" "$URL"
VERSION="$(tar -tzf "$TMP" | awk -F/ 'NR == 1 { print $1 }')"
tar -xzf "$TMP" -C "$ZIEL"
# versions.json ergänzen (mehrere Gebiete können nebeneinander liegen; das zuletzt geladene ist „aktuell“)
python3 - "$ZIEL" "$VERSION" <<'PY'
import json, os, sys
ziel, neu = sys.argv[1], sys.argv[2]
pfad = os.path.join(ziel, "versions.json")
v = json.load(open(pfad, encoding="utf-8")) if os.path.exists(pfad) else {"versionen": []}
m = json.load(open(os.path.join(ziel, neu, "manifest.json"), encoding="utf-8"))
v["versionen"] = [x for x in v.get("versionen", []) if x.get("id") != neu]
v["versionen"].append({"id": neu, "gebiet": m.get("gebiet", ""), "erstellt": m.get("erstellt", "")})
v["aktuell"] = neu
json.dump(v, open(pfad, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"Weltdaten {neu} in {ziel}, aktuell = {neu}")
PY
