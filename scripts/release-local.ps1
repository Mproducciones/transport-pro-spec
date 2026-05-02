$ErrorActionPreference = "Stop"

Write-Host "== Transport Pro: release local =="

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "-- Backend build + smoke"
Set-Location "$root\backend"
npm run build
npm run smoke

Write-Host "-- Frontend build"
Set-Location "$root\frontend"
npm run build

Write-Host "== OK: release local validado =="
Write-Host "Siguiente paso: publicar frontend/dist y desplegar backend start en tu hosting."

