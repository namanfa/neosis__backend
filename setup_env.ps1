$ErrorActionPreference = 'Stop'

$workspace = $PSScriptRoot
$projectPython = Join-Path $workspace '.python312\python.exe'
$venvPython = Join-Path $workspace '.venv\Scripts\python.exe'

if (Test-Path $projectPython) {
    $python = $projectPython
} else {
    $launcher = Get-Command py -ErrorAction SilentlyContinue
    if ($launcher) {
        & $launcher.Source -3.12 -c 'import sys; print(sys.executable)' | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $python = (& $launcher.Source -3.12 -c 'import sys; print(sys.executable)').Trim()
        }
    }
}

if (-not $python -or -not (Test-Path $python)) {
    throw 'Python 3.12 is required. Install Python 3.12, then rerun .\setup_env.ps1.'
}

$version = & $python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'
if ($version -ne '3.12') {
    throw "Expected Python 3.12, found $version at $python."
}

if (-not (Test-Path $venvPython)) {
    & $python -m venv (Join-Path $workspace '.venv')
}

& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Could not upgrade pip.' }

& $venvPython -m pip install -r (Join-Path $workspace 'backend\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

Write-Host "Workspace Python environment is ready: $venvPython"
