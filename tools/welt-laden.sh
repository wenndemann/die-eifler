#!/usr/bin/env bash
# Fertige Weltdaten aus dem GitHub-Release laden (gerechnet von .github/workflows/weltdaten.yml), statt sie mit
# npm run setup neu zu rechnen. Aufruf: tools/welt-laden.sh [gebiet …|alle]  (Standard nideggen)
# Gebiete: nideggen, nordeifel, eifelsteig und die Kerngebiete der Völkchen (monschau, rursee, rureifel, vulkaneifel, ahr, laach,
# suedeifel, schneifel, ostbelgien, oesling). „alle“ lädt jedes, das als Release da ist, und überspringt die anderen.
set -euo pipefail
if [ "${1:-}" = "alle" ]; then
  for g in nideggen nordeifel eifelsteig monschau rursee rureifel vulkaneifel ahr laach suedeifel schneifel ostbelgien oesling; do
    "$0" "$g" || echo "($g: kein Release, übersprungen)"
  done
  exit 0
fi
if [ "$#" -gt 1 ]; then for g in "$@"; do "$0" "$g"; done; exit 0; fi
GEBIET="${1:-nideggen}"
REPO="${WELT_REPO:-wenndemann/die-eifler}"
WURZEL="$(cd "$(dirname "$0")/.." && pwd)"
ZIEL="${WELT_DATEN:-$WURZEL/welt-daten}"
URL="https://github.com/$REPO/releases/download/welt-daten-$GEBIET/welt-daten-$GEBIET.tar.gz"
mkdir -p "$ZIEL"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
echo "Lade $URL"
# Die Weiterleitung zum Datei-Server von GitHub selbst auflösen: mit -L schickt curl hinter manchen Proxys Kopfzeilen mit, die der
# signierte Link ablehnt (401)
ZIEL_URL="$(curl -fsS -o /dev/null -w '%{redirect_url}' "$URL" || true)"
curl -f --retry 4 --retry-delay 2 -o "$TMP" "${ZIEL_URL:-$URL}"
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
