<#
.SYNOPSIS
    Elenchus release launcher for end users.
.DESCRIPTION
    Runs the backend and serves the prebuilt frontend bundle from FastAPI.
    Requires Python only at runtime.
#>

param(
    [switch]$SkipInstall,
    [int]$Port = 8001
)

$ErrorActionPreference = "Stop"

$RED = [char]27 + "[31m"
$GREEN = [char]27 + "[32m"
$YELLOW = [char]27 + "[33m"
$BLUE = [char]27 + "[34m"
$CYAN = [char]27 + "[36m"
$RESET = [char]27 + "[0m"
$BOLD = [char]27 + "[1m"

function Print-OK { param($Text) Write-Host $GREEN"[OK]"$RESET" $Text" }
function Print-Err { param($Text) Write-Host $RED"[ERROR]"$RESET" $Text" }
function Print-Warn { param($Text) Write-Host $YELLOW"[WARN]"$RESET" $Text" }
function Print-Info { param($Text) Write-Host $BLUE"[INFO]"$RESET" $Text" }

function Get-FreePort {
    param([int]$StartPort)

    for ($offset = 0; $offset -lt 10; $offset++) {
        $candidate = $StartPort + $offset
        $portCheck = netstat -ano 2>$null | Select-String ":$candidate\s"
        if (-not $portCheck) {
            return $candidate
        }
    }

    throw "No free port found in range $StartPort-$($StartPort + 9)."
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ScriptDir "backend"
$FrontendDir = Join-Path $ScriptDir "frontend"
$FrontendDistDir = Join-Path $FrontendDir "dist"
$FrontendIndex = Join-Path $FrontendDistDir "index.html"
$VenvDir = Join-Path $BackendDir "venv"

Write-Host ""
Write-Host $BOLD$CYAN"   __                                         "$RESET
Write-Host $BOLD$CYAN"  /  \___  ___  __ _ _   _  ___ _ __   ___ ___ "$RESET
Write-Host $BOLD$CYAN" / /\ / _ \/ __|/ _`` | | | |/ _ \ '_ \ / __/ _ \"$RESET
Write-Host $BOLD$CYAN"/ /_//  __/\__ \ (_| | |_| |  __/ | | | (_|  __/"$RESET
Write-Host $BOLD$CYAN",___/ \___||___/\__, |\__,_|\___|_| |_|\___\___|"$RESET
Write-Host $BOLD$CYAN"                  |_|"$RESET
Write-Host ""
Write-Host $BOLD"   Release Launcher"$RESET
Write-Host ""

Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 1/4: Environment Check"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    Print-Err "Python not found, please install Python 3.10+"
    exit 1
}

$pyVersionRaw = python --version 2>&1
$pyVersion = $pyVersionRaw.ToString().Replace("Python ", "").Trim()
Print-OK "Python $pyVersion installed"

if (-not (Test-Path $FrontendIndex)) {
    Print-Err "Release frontend bundle not found: $FrontendIndex"
    Write-Host ""
    Write-Host "For maintainers, build it first with:"
    Write-Host "  npm --prefix frontend run build"
    Write-Host ""
    exit 1
}

Print-OK "Frontend release bundle detected"

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 2/4: Backend Setup"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

if (-not (Test-Path $VenvDir)) {
    Print-Info "Creating Python virtual environment..."
    python -m venv $VenvDir
    Print-OK "Virtual environment created"
} else {
    Print-OK "Virtual environment already exists"
}

$PipExe = Join-Path $VenvDir "Scripts\pip.exe"
$PythonExe = Join-Path $VenvDir "Scripts\python.exe"

if (-not $SkipInstall) {
    Print-Info "Installing backend dependencies..."
    & $PipExe install -r (Join-Path $BackendDir "requirements.txt")
    Print-OK "Backend dependencies installed"
} else {
    Print-Info "Skipping dependency installation"
}

$EnvFile = Join-Path $BackendDir ".env"
$EnvExample = Join-Path $BackendDir ".env.example"
if (-not (Test-Path $EnvFile) -and (Test-Path $EnvExample)) {
    Print-Info "Creating .env config file..."
    Copy-Item $EnvExample $EnvFile
    Print-OK ".env file created"
}

$PortToUse = Get-FreePort -StartPort $Port
if ($PortToUse -ne $Port) {
    Print-Warn "Port $Port is in use, using port $PortToUse instead"
}

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 3/4: Starting Elenchus"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

$backendProcess = Start-Process -FilePath $PythonExe `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$PortToUse" `
    -WorkingDirectory $BackendDir `
    -WindowStyle Hidden `
    -PassThru

Start-Sleep -Seconds 1

if ($backendProcess.HasExited) {
    Print-Err "Backend process exited immediately."
    exit 1
}

Print-Info "Waiting for service to be ready..."
$backendReady = $false

for ($i = 0; $i -lt 30; $i++) {
    try {
        $result = curl.exe -s "http://localhost:$PortToUse/health" 2>$null
        if ($result -and $result -match '"status"\s*:\s*"ok"') {
            $backendReady = $true
            break
        }
    } catch {}
    Start-Sleep -Milliseconds 500
}

if (-not $backendReady) {
    Print-Err "Backend failed to become ready."
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

Print-OK "Elenchus is ready"

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 4/4: Open App"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""
Write-Host "  App URL:      "$BOLD"http://localhost:$PortToUse"$RESET
Write-Host "  API Docs:     "$BOLD"http://localhost:$PortToUse/docs"$RESET
Write-Host ""
Print-Warn "First time? Add your model provider API Keys in the Settings page."
Print-Info "Opening browser..."
Start-Process "http://localhost:$PortToUse"

Write-Host ""
Write-Host $CYAN"Press Ctrl+C to stop Elenchus"$RESET
Write-Host ""

try {
    while ($true) {
        Start-Sleep -Seconds 1
        if ($backendProcess -and $backendProcess.HasExited) {
            Print-Warn "Backend process has stopped"
            break
        }
    }
} finally {
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
