#!/usr/bin/env bash
# Start einer Cloud-Session (Claude Code im Web): Pakete installieren und die fertigen Weltdaten aus dem GitHub-Release laden,
# damit npm test, npm run build und npm run test:smoke sofort laufen. Lokal (nicht in der Cloud) passiert nichts.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
[ -d node_modules ] || npm ci --no-audit --no-fund
# Weltdaten (welt-daten/ ist nicht in Git): die ganze Eifel, sobald es das Release gibt; sonst Nordeifel und Nideggen.
# Das zuletzt geladene ist „aktuell“.
if grep -qs "\"gebiet\": \"eifel\"" welt-daten/*/manifest.json || tools/welt-laden.sh eifel 2>/dev/null; then exit 0; fi
for g in nordeifel nideggen; do
  ls welt-daten/*-"$g"/manifest.json >/dev/null 2>&1 || tools/welt-laden.sh "$g" || echo "Weltdaten $g nicht geladen (Release fehlt?)"
done
