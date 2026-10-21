#!/usr/bin/env bash
# Release „welt-daten-<gebiet>“ mit dem gepackten Datenordner anlegen oder ersetzen (aus dem Workflow „Weltdaten“).
# Aufruf: tools/welt-release.sh <gebiet> <version> <datei.tar.gz>   (braucht GH_TOKEN)
set -euo pipefail
GEBIET="$1"; VERSION="$2"; DATEI="$3"
TAG="welt-daten-$GEBIET"
NOTIZ="Weltdaten $VERSION (Gebiet $GEBIET), gerechnet am $(date -u +%Y-%m-%d) aus ${GITHUB_SHA::7}. Laden: tools/welt-laden.sh $GEBIET"
if gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" "$DATEI" --clobber
  gh release edit "$TAG" --notes "$NOTIZ"
else
  gh release create "$TAG" "$DATEI" --title "Weltdaten $GEBIET" --notes "$NOTIZ" --target "$GITHUB_SHA"
fi
