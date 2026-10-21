#!/usr/bin/env bash
# Start einer Cloud-Session (Claude Code im Web): Pakete installieren und die fertigen Weltdaten aus dem GitHub-Release laden,
# damit npm test, npm run build und npm run test:smoke sofort laufen. Lokal (nicht in der Cloud) passiert nichts.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
[ -d node_modules ] || npm ci --no-audit --no-fund
# Weltdaten (welt-daten/ ist nicht in Git): Nideggen für den Smoke-Test, Nordeifel für die Vorschläge; das zuletzt geladene ist „aktuell“
for g in nordeifel nideggen; do
  ls welt-daten/*-"$g"/manifest.json >/dev/null 2>&1 || tools/welt-laden.sh "$g" || echo "Weltdaten $g nicht geladen (Release fehlt?)"
done
