# Cumbre doctor — paste output to Claude/Cowork for status check
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "=== CUMBRE repo: structure + model + tests ==="
Get-ChildItem -Name | Where-Object { $_ -notmatch '^\.' }
Write-Host "--- ml/ ---"
Get-ChildItem ml -Name | Select-Object -First 15
if (Test-Path ml\CUMBRE_fameblind_model.pkl) { Write-Host "  model trained OK" } else { Write-Host "  model NOT trained yet" }
if (Get-Command py -ErrorAction SilentlyContinue) {
    py ml/test_cumbre.py 2>&1 | Select-Object -Last 1
} else {
    Write-Host "  python not found — skip test_cumbre.py"
}
git log --oneline -1 2>$null
git status -sb 2>$null
