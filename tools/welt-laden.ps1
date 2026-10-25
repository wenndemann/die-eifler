# Fertige Weltdaten aus dem GitHub-Release laden (wie tools/welt-laden.sh, für Windows). Läuft mit Windows PowerShell 5.1 und
# PowerShell 7; tar.exe ist ab Windows 10 dabei.
# Aufruf:  powershell -ExecutionPolicy Bypass -File tools\welt-laden.ps1 [gebiet …|alle]  (Standard nideggen)
# Gebiete: nideggen, nordeifel, eifelsteig, eifel und die Kerngebiete der Völkchen (monschau, rursee, rureifel, vulkaneifel, ahr,
# laach, suedeifel, schneifel, ostbelgien, oesling). „alle“ lädt jedes, das als Release da ist, und überspringt die anderen.
# Umgebung wie beim Shell-Skript: WELT_REPO (Standard wenndemann/die-eifler), WELT_DATEN (Standard welt-daten/ im Projekt).
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Gebiete)
$ErrorActionPreference = 'Stop'
# Ohne Fortschrittsbalken ist Invoke-WebRequest in Windows PowerShell 5.1 um ein Vielfaches schneller
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Repo = if ($env:WELT_REPO) { $env:WELT_REPO } else { 'wenndemann/die-eifler' }
$Wurzel = Split-Path -Parent $PSScriptRoot
$Ziel = if ($env:WELT_DATEN) { $env:WELT_DATEN } else { Join-Path $Wurzel 'welt-daten' }
$Ziel = [IO.Path]::GetFullPath($Ziel)

# PowerShell 7 macht aus Datumstexten in JSON ein DateTime; zurück ins Format der Pipeline (2026-10-21T21:05:25Z)
function Text($x) {
  if ($x -is [datetime]) { return $x.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", [Globalization.CultureInfo]::InvariantCulture) }
  return [string]$x
}

function Lade([string]$Gebiet) {
  $Url = "https://github.com/$Repo/releases/download/welt-daten-$Gebiet/welt-daten-$Gebiet.tar.gz"
  New-Item -ItemType Directory -Force -Path $Ziel | Out-Null
  $Tmp = [IO.Path]::GetTempFileName()
  try {
    Write-Host "Lade $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Tmp -UseBasicParsing
    # erste Zeile des Archivs ist der Versionsordner, z. B. eifel-2026.10/
    $Erste = & tar -tzf $Tmp | Select-Object -First 1
    if ($LASTEXITCODE -ne 0 -and -not $Erste) { throw "tar konnte $Tmp nicht lesen" }
    $Version = ($Erste -split '/')[0]
    & tar -xzf $Tmp -C $Ziel
    if ($LASTEXITCODE -ne 0) { throw "Entpacken nach $Ziel fehlgeschlagen" }
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $Tmp
  }

  # versions.json ergänzen (mehrere Gebiete können nebeneinander liegen; das zuletzt geladene ist „aktuell“)
  $Utf8 = New-Object Text.UTF8Encoding($false)
  $Pfad = Join-Path $Ziel 'versions.json'
  $Liste = @()
  if (Test-Path $Pfad) {
    $Alt = [IO.File]::ReadAllText($Pfad, $Utf8) | ConvertFrom-Json
    $Liste = @($Alt.versionen | Where-Object { $_ -and $_.id -ne $Version } |
      ForEach-Object { [pscustomobject][ordered]@{ id = [string]$_.id; gebiet = [string]$_.gebiet; erstellt = (Text $_.erstellt) } })
  }
  $M = [IO.File]::ReadAllText((Join-Path (Join-Path $Ziel $Version) 'manifest.json'), $Utf8) | ConvertFrom-Json
  $Liste += [pscustomobject][ordered]@{ id = $Version; gebiet = [string]$M.gebiet; erstellt = (Text $M.erstellt) }
  $Neu = [pscustomobject][ordered]@{ versionen = $Liste; aktuell = $Version }
  # ohne BOM, sonst stolpert das Shell-Skript (Python) beim nächsten Laden darüber
  [IO.File]::WriteAllText($Pfad, ($Neu | ConvertTo-Json -Depth 5), $Utf8)
  Write-Host "Weltdaten $Version in $Ziel, aktuell = $Version"
}

if (-not $Gebiete -or $Gebiete.Count -eq 0) { $Gebiete = @('nideggen') }
if ($Gebiete.Count -eq 1 -and $Gebiete[0] -eq 'alle') {
  foreach ($g in 'nideggen', 'nordeifel', 'eifelsteig', 'monschau', 'rursee', 'rureifel', 'vulkaneifel', 'ahr', 'laach', 'suedeifel',
      'schneifel', 'ostbelgien', 'oesling') {
    try { Lade $g } catch { Write-Host "($g`: kein Release, übersprungen)" }
  }
  exit 0
}
foreach ($g in $Gebiete) {
  try { Lade $g } catch { Write-Host "Fehler bei $g`: $($_.Exception.Message)"; exit 1 }
}
