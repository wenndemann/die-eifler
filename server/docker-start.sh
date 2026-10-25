#!/bin/sh
# Start im Docker-Image: Weltdaten aus dem eingehängten Ordner /welt, wenn dort welche liegen (versions.json, wie von
# tools/welt-laden.sh oder tools\welt-laden.ps1 abgelegt), sonst die beim Bauen ins Image geladenen (/app/welt-daten).
# Ein ausdrücklich gesetztes WELT_DATEN gewinnt immer.
if [ -z "${WELT_DATEN:-}" ]; then
  if [ -f /welt/versions.json ]; then WELT_DATEN=/welt; else WELT_DATEN=/app/welt-daten; fi
fi
[ -f "$WELT_DATEN/versions.json" ] || echo "Achtung: keine Weltdaten in $WELT_DATEN (versions.json fehlt). Ordner nach /welt einhängen oder Image mit WELT_GEBIET bauen."
echo "Weltdaten: $WELT_DATEN"
export WELT_DATEN
exec node server/vermittlung.mjs "$@"
