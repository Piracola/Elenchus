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
$RootDir = $ScriptDir
$RuntimeDir = Join-Path $RootDir "runtime"
$RuntimeBackendDir = Join-Path $RuntimeDir "backend"

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

$EnvFile = Join-Path $RuntimeBackendDir ".env"
$EnvExample = Join-Path $BackendDir ".env.example"
if (-not (Test-Path $RuntimeBackendDir)) {
    New-Item -ItemType Directory -Path $RuntimeBackendDir -Force | Out-Null
}
if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Print-Info "Creating runtime .env config file..."
        Copy-Item $EnvExample $EnvFile
        Print-OK "runtime .env file created"
        Print-Info "A local encryption key will be generated automatically on first backend start"
        Print-Warn "Model provider API Keys are configured later in the web UI"
    }
} else {
    Print-OK "runtime .env config file already exists"
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

Push-Location $RootDir

$backendJob = $null
$frontendJob = $null
$BackendPort = 8001

if (-not $FrontendOnly) {
    Print-Info "Checking port 8001..."
    
    $portToUse = 8001
    $maxPortAttempts = 10
    
    for ($portAttempt = 0; $portAttempt -lt $maxPortAttempts; $portAttempt++) {
        $currentPort = 8001 + $portAttempt
        $portCheck = netstat -ano 2>$null | Select-String ":$currentPort\s"
        
        if (-not $portCheck) {
            $portToUse = $currentPort
            break
        }
        
        if ($portAttempt -eq 0) {
            Print-Info "Port 8001 is in use, trying to free it..."
            
            for ($attempt = 0; $attempt -lt 3; $attempt++) {
                try {
                    Get-NetTCPConnection -LocalPort $currentPort -ErrorAction SilentlyContinue | ForEach-Object {
                        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
                    }
                } catch {}
                
                Start-Sleep -Seconds 1
                
                $portCheck = netstat -ano 2>$null | Select-String ":$currentPort\s"
                if (-not $portCheck) {
                    $portToUse = $currentPort
                    break
                }
                
                Print-Info "Using kill-port to free port $currentPort..."
                npx kill-port $currentPort 2>$null
                Start-Sleep -Seconds 2
                
                $portCheck = netstat -ano 2>$null | Select-String ":$currentPort\s"
                if (-not $portCheck) {
                    $portToUse = $currentPort
                    break
                }
            }
            
            if (-not $portCheck) { break }
        }
    }
    
    if ($portToUse -ne 8001) {
        Print-Warn "Port 8001 unavailable, using port $portToUse"
    }
    
    $BackendPort = $portToUse
}

Write-Host ""
Write-Host $BOLD$GREEN"  Elenchus Starting..."$RESET
Write-Host ""
Write-Host "  "$CYAN"Service URLs:"$RESET
if (-not $FrontendOnly) {
    Write-Host "    Backend API:  "$BOLD"http://localhost:$BackendPort"$RESET
    Write-Host "    API Docs:     "$BOLD"http://localhost:$BackendPort/docs"$RESET
}
if (-not $BackendOnly) {
    Write-Host "    Frontend UI:  "$BOLD"http://localhost:5173"$RESET
}
Write-Host ""

if (-not $FrontendOnly) {
    Print-Warn "First time? Open the web UI and add your model provider API Keys there"
}
Write-Host ""

Write-Host "  "$CYAN"Press Ctrl+C to stop all services"$RESET
Write-Host ""

if ($BackendOnly) {
    npm run dev:backend
} elseif ($FrontendOnly) {
    npm run dev:frontend
} else {
    Print-Info "Starting backend service..."
    
    $backendProcess = Start-Process -FilePath "$VenvDir\Scripts\python.exe" `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$BackendPort" `
        -WorkingDirectory $BackendDir `
        -WindowStyle Hidden `
        -PassThru
    
    Start-Sleep -Seconds 2
    
    if ($backendProcess -and $backendProcess.HasExited) {
        Print-Err "Backend process exited immediately."
        exit 1
    }
    
    Print-Info "Waiting for backend to be ready..."
    $maxRetries = 30
    $backendReady = $false
    
    for ($i = 0; $i -lt $maxRetries; $i++) {
        try {
            $result = curl.exe -s "http://localhost:$BackendPort/health" 2>$null
            if ($result -and $result -match '"status"\s*:\s*"ok"') {
                $backendReady = $true
                Print-OK "Backend is ready"
                break
            }
        } catch {}
        Write-Host "." -NoNewline
        Start-Sleep -Milliseconds 500
    }
    Write-Host ""
    
    if (-not $backendReady) {
        Print-Err "Backend failed to start."
        if ($backendProcess -and -not $backendProcess.HasExited) {
            Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
        }
        exit 1
    }
    
    Print-Info "Starting frontend service..."
    
    $npmPath = (Get-Command npm -ErrorAction SilentlyContinue).Source
    if (-not $npmPath) {
        Print-Err "npm not found in PATH"
        exit 1
    }
    
    $FrontendEnvFile = Join-Path $FrontendDir ".env"
    $envContent = "VITE_BACKEND_PORT=$BackendPort"
    Set-Content -Path $FrontendEnvFile -Value $envContent -Force
    Print-OK "Frontend .env configured with port $BackendPort"
    
    Push-Location $FrontendDir
    $frontendProcess = Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoExit", "-Command", "npm run dev" `
        -PassThru
    Pop-Location
    
    Start-Sleep -Seconds 3
    Print-Info "Opening browser..."
    Start-Process "http://localhost:5173"
    
    Write-Host ""
    Write-Host $CYAN"Services are running. Press Ctrl+C to stop."$RESET
    Write-Host ""
    
    try {
        while ($true) {
            Start-Sleep -Seconds 1
            if ($backendProcess -and $backendProcess.HasExited) {
                Print-Warn "Backend process has stopped"
                break
            }
        }
    } catch [System.Management.Automation.HaltCommandException] {
    }
    
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
}

Pop-Location
