$ErrorActionPreference = "Stop"

Write-Host "== Transport Pro: release production =="

$requiredVars = @(
  "PROD_API_BASE",
  "SMOKE_COMPANY_TAX_ID",
  "SMOKE_ADMIN_EMAIL",
  "SMOKE_ADMIN_PASSWORD",
  "SMOKE_CLIENT_EMAIL",
  "SMOKE_CLIENT_PASSWORD",
  "SMOKE_DRIVER_EMAIL",
  "SMOKE_DRIVER_PASSWORD"
)

$missing = @()
foreach ($v in $requiredVars) {
  if (-not (Get-Item "env:$v" -ErrorAction SilentlyContinue)) {
    $missing += $v
  }
}

if ($missing.Count -gt 0) {
  throw "Faltan variables de entorno: $($missing -join ', ')"
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\backend"

Write-Host "-- Build backend"
npm run build

Write-Host "-- Smoke contra API productiva"
$env:SMOKE_API_BASE = $env:PROD_API_BASE
npm run smoke

Set-Location "$root\frontend"
Write-Host "-- Build frontend"
npm run build

Write-Host "== OK: validacion productiva completada =="

