<#
.SYNOPSIS
    Elenchus AI Debate Framework - One-Click Start Script
.DESCRIPTION
    Auto check environment, install dependencies and start services
#>

param(
    [switch]$SkipInstall,
    [switch]$BackendOnly,
    [switch]$FrontendOnly
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

Clear-Host
Write-Host ""
Write-Host $BOLD$CYAN"   __                                         "$RESET
Write-Host $BOLD$CYAN"  /  \___  ___  __ _ _   _  ___ _ __   ___ ___ "$RESET
Write-Host $BOLD$CYAN" / /\ / _ \/ __|/ _`` | | | |/ _ \ '_ \ / __/ _ \"$RESET
Write-Host $BOLD$CYAN"/ /_//  __/\__ \ (_| | |_| |  __/ | | | (_|  __/"$RESET
Write-Host $BOLD$CYAN",___/ \___||___/\__, |\__,_|\___|_| |_|\___\___|"$RESET
Write-Host $BOLD$CYAN"                  |_|"$RESET
Write-Host ""
Write-Host $BOLD"   AI Debate Framework - One-Click Start Script"$RESET
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ScriptDir "backend"
$FrontendDir = Join-Path $ScriptDir "frontend"
$VenvDir = Join-Path $BackendDir "venv"

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 1/5: Environment Check"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

$checksPassed = $true

Write-Host "Checking Python..."
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd) {
    $pyVersionRaw = python --version 2>&1
    $pyVersion = $pyVersionRaw.ToString().Replace("Python ", "").Trim()
    Print-OK "Python $pyVersion installed"
} else {
    Print-Err "Python not found, please install Python 3.10+"
    $checksPassed = $false
}

if (-not $FrontendOnly) {
    Write-Host "Checking pip..."
    $pipCmd = Get-Command pip -ErrorAction SilentlyContinue
    if ($pipCmd) {
        Print-OK "pip installed"
    } else {
        Print-Err "pip not found"
        $checksPassed = $false
    }
}

if (-not $BackendOnly) {
    Write-Host "Checking Node.js..."
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        $nodeVersionRaw = node --version 2>&1
        $nodeVersion = $nodeVersionRaw.ToString().Replace("v", "").Trim()
        Print-OK "Node.js $nodeVersion installed"
    } else {
        Print-Err "Node.js not found, please install Node.js 18+"
        $checksPassed = $false
    }

    Write-Host "Checking npm..."
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if ($npmCmd) {
        Print-OK "npm installed"
    } else {
        Print-Err "npm not found"
        $checksPassed = $false
    }
}

if (-not $checksPassed) {
    Write-Host ""
    Print-Err "Environment check failed, please install missing dependencies"
    Write-Host ""
    Write-Host "Recommended installation:"
    Write-Host "  Python:  https://www.python.org/downloads/"
    Write-Host "  Node.js: https://nodejs.org/"
    exit 1
}

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 2/5: Backend Setup"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

Push-Location $BackendDir

if (-not (Test-Path $VenvDir)) {
    Print-Info "Creating Python virtual environment..."
    python -m venv $VenvDir
    Print-OK "Virtual environment created"
} else {
    Print-OK "Virtual environment already exists"
}

Print-Info "Activating virtual environment..."
& "$VenvDir\Scripts\Activate.ps1"

if (-not $SkipInstall) {
    Print-Info "Installing backend dependencies..."
    $ErrorActionPreference = "Continue"
    & "$VenvDir\Scripts\pip.exe" install -r requirements.txt 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    Print-OK "Backend dependencies installed"
} else {
    Print-Info "Skipping dependency installation"
}

$EnvFile = Join-Path $BackendDir ".env"
$EnvExample = Join-Path $BackendDir ".env.example"
if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Print-Info "Creating .env config file..."
        Copy-Item $EnvExample $EnvFile
        Print-OK ".env file created"
        Print-Warn "Please edit backend/.env to configure your API Keys"
    }
} else {
    Print-OK ".env config file already exists"
}

Pop-Location

if (-not $BackendOnly) {
    Write-Host ""
    Write-Host $CYAN"========================================"$RESET
    Write-Host $BOLD"Step 3/5: Frontend Setup"$RESET
    Write-Host $CYAN"========================================"$RESET
    Write-Host ""

    Push-Location $FrontendDir

    if (-not (Test-Path "node_modules")) {
        if (-not $SkipInstall) {
            Print-Info "Installing frontend dependencies..."
            npm install --silent 2>$null
            Print-OK "Frontend dependencies installed"
        } else {
            Print-Info "Skipping dependency installation"
        }
    } else {
        Print-OK "node_modules already exists"
    }

    Pop-Location
}

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 4/5: Installing Process Manager"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

$RootDir = $ScriptDir
$RootPackageJson = Join-Path $RootDir "package.json"

if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
    Print-Info "Installing concurrently for unified process management..."
    Push-Location $RootDir
    npm install --silent 2>$null
    Pop-Location
    Print-OK "Process manager installed"
} else {
    Print-OK "Process manager already installed"
}

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 5/5: Starting Services"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

Write-Host ""
Write-Host $BOLD$GREEN"  Elenchus Starting..."$RESET
Write-Host ""
Write-Host "  "$CYAN"Service URLs:"$RESET
if (-not $FrontendOnly) {
    Write-Host "    Backend API:  "$BOLD"http://localhost:8000"$RESET
    Write-Host "    API Docs:     "$BOLD"http://localhost:8000/docs"$RESET
}
if (-not $BackendOnly) {
    Write-Host "    Frontend UI:  "$BOLD"http://localhost:5173"$RESET
}
Write-Host ""

if (-not $FrontendOnly) {
    Print-Warn "First time? Please configure API Keys in backend/.env"
}
Write-Host ""

if (-not $BackendOnly) {
    Print-Info "Opening browser in 5 seconds..."
    Start-Sleep -Seconds 5
    Start-Process "http://localhost:5173"
}

Write-Host ""
Write-Host "  "$CYAN"Press Ctrl+C to stop all services"$RESET
Write-Host ""

Push-Location $RootDir

if ($BackendOnly) {
    npm run dev:backend
} elseif ($FrontendOnly) {
    npm run dev:frontend
} else {
    npm run dev
}

Pop-Location
