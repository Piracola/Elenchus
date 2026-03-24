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

function Get-DependencyFingerprint {
    param(
        [string[]]$Paths
    )

    $entries = foreach ($path in $Paths) {
        if (-not (Test-Path $path)) {
            "missing::$path"
            continue
        }

        $item = Get-Item $path
        $hash = (Get-FileHash -Algorithm SHA256 -Path $path).Hash
        "$($item.FullName)|$($item.Length)|$hash"
    }

    ($entries -join "`n")
}

function Test-DependencyRefreshNeeded {
    param(
        [string]$StateFile,
        [string[]]$DependencyFiles
    )

    if (-not (Test-Path $StateFile)) {
        return $true
    }

    $savedFingerprint = Get-Content $StateFile -Raw -ErrorAction SilentlyContinue
    $currentFingerprint = Get-DependencyFingerprint -Paths $DependencyFiles
    return $savedFingerprint -ne $currentFingerprint
}

function Save-DependencyFingerprint {
    param(
        [string]$StateFile,
        [string[]]$DependencyFiles
    )

    $stateDir = Split-Path -Parent $StateFile
    if ($stateDir -and -not (Test-Path $stateDir)) {
        New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    }

    Set-Content -Path $StateFile -Value (Get-DependencyFingerprint -Paths $DependencyFiles) -NoNewline
}

function Start-DelayedBrowser {
    param(
        [string]$Url,
        [int]$DelaySeconds = 4
    )

    $escapedUrl = $Url.Replace("'", "''")
    $command = "Start-Sleep -Seconds $DelaySeconds; Start-Process '$escapedUrl'"

    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command `
        -WindowStyle Hidden | Out-Null
}

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
$RootDir = $ScriptDir
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$VenvDir = Join-Path $BackendDir "venv"
$RuntimeDir = Join-Path $RootDir "runtime"
$InstallStateDir = Join-Path $RuntimeDir ".install-state"

$BackendPython = Join-Path $VenvDir "Scripts\python.exe"
$BackendPip = Join-Path $VenvDir "Scripts\pip.exe"
$BackendStateFile = Join-Path $InstallStateDir "backend.txt"
$FrontendStateFile = Join-Path $InstallStateDir "frontend.txt"
$RootStateFile = Join-Path $InstallStateDir "root.txt"
$BackendDependencyFiles = @(
    (Join-Path $BackendDir "requirements.txt")
)
$FrontendDependencyFiles = @(
    (Join-Path $FrontendDir "package.json"),
    (Join-Path $FrontendDir "package-lock.json")
)
$RootDependencyFiles = @(
    (Join-Path $RootDir "package.json"),
    (Join-Path $RootDir "package-lock.json")
)

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

if (-not $FrontendOnly) {
    Write-Host ""
    Write-Host $CYAN"========================================"$RESET
    Write-Host $BOLD"Step 2/5: Backend Setup"$RESET
    Write-Host $CYAN"========================================"$RESET
    Write-Host ""

    Push-Location $BackendDir

    $venvCreated = $false

    if (-not (Test-Path $BackendPython)) {
        Print-Info "Creating Python virtual environment..."
        python -m venv $VenvDir
        if ($LASTEXITCODE -ne 0) {
            Print-Err "Failed to create Python virtual environment"
            exit $LASTEXITCODE
        }

        $venvCreated = $true
        Print-OK "Virtual environment created"
    } else {
        Print-OK "Virtual environment already exists"
    }

    if (-not $SkipInstall) {
        $backendInstallNeeded = $venvCreated -or (Test-DependencyRefreshNeeded -StateFile $BackendStateFile -DependencyFiles $BackendDependencyFiles)

        if ($backendInstallNeeded) {
            Print-Info "Installing backend dependencies..."
            & $BackendPip install --disable-pip-version-check --quiet -r requirements.txt
            if ($LASTEXITCODE -ne 0) {
                Print-Err "Backend dependency installation failed"
                exit $LASTEXITCODE
            }

            Save-DependencyFingerprint -StateFile $BackendStateFile -DependencyFiles $BackendDependencyFiles
            Print-OK "Backend dependencies installed"
        } else {
            Print-OK "Backend dependencies are up to date"
        }
    } else {
        Print-Info "Skipping dependency installation"
    }
    Print-Info "Runtime configuration is loaded from $RuntimeDir\\config.json"

    Pop-Location
}

if (-not $BackendOnly) {
    Write-Host ""
    Write-Host $CYAN"========================================"$RESET
    Write-Host $BOLD"Step 3/5: Frontend Setup"$RESET
    Write-Host $CYAN"========================================"$RESET
    Write-Host ""

    Push-Location $FrontendDir

    $frontendModulesDir = Join-Path $FrontendDir "node_modules"
    $frontendInstallNeeded = (-not (Test-Path $frontendModulesDir)) -or (Test-DependencyRefreshNeeded -StateFile $FrontendStateFile -DependencyFiles $FrontendDependencyFiles)

    if ($frontendInstallNeeded) {
        if ($SkipInstall) {
            if (-not (Test-Path $frontendModulesDir)) {
                Print-Err "Frontend dependencies are missing. Run once without -SkipInstall."
                exit 1
            }

            Print-Warn "Frontend dependency files changed, but installation was skipped"
        } else {
            Print-Info "Installing frontend dependencies..."
            npm install --silent 2>$null
            if ($LASTEXITCODE -ne 0) {
                Print-Err "Frontend dependency installation failed"
                exit $LASTEXITCODE
            }

            Save-DependencyFingerprint -StateFile $FrontendStateFile -DependencyFiles $FrontendDependencyFiles
            Print-OK "Frontend dependencies installed"
        }
    } else {
        Print-OK "Frontend dependencies are up to date"
    }

    Pop-Location
}

if (-not $BackendOnly -and -not $FrontendOnly) {
    Write-Host ""
    Write-Host $CYAN"========================================"$RESET
    Write-Host $BOLD"Step 4/5: Installing Process Manager"$RESET
    Write-Host $CYAN"========================================"$RESET
    Write-Host ""

    Push-Location $RootDir

    $rootModulesDir = Join-Path $RootDir "node_modules"
    $rootInstallNeeded = (-not (Test-Path $rootModulesDir)) -or (Test-DependencyRefreshNeeded -StateFile $RootStateFile -DependencyFiles $RootDependencyFiles)

    if ($rootInstallNeeded) {
        if ($SkipInstall) {
            if (-not (Test-Path $rootModulesDir)) {
                Print-Err "Process manager dependencies are missing. Run once without -SkipInstall."
                exit 1
            }

            Print-Warn "Root dependency files changed, but installation was skipped"
        } else {
            Print-Info "Installing concurrently for unified process management..."
            npm install --silent 2>$null
            if ($LASTEXITCODE -ne 0) {
                Print-Err "Process manager installation failed"
                exit $LASTEXITCODE
            }

            Save-DependencyFingerprint -StateFile $RootStateFile -DependencyFiles $RootDependencyFiles
            Print-OK "Process manager installed"
        }
    } else {
        Print-OK "Process manager already installed"
    }

    Pop-Location
}

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 5/5: Starting Services"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

Push-Location $RootDir

$BackendPort = 8001
$localKillPort = Join-Path $RootDir "node_modules\.bin\kill-port.cmd"

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

                if (Test-Path $localKillPort) {
                    Print-Info "Using local kill-port to free port $currentPort..."
                    & $localKillPort $currentPort 2>$null
                    Start-Sleep -Seconds 2

                    $portCheck = netstat -ano 2>$null | Select-String ":$currentPort\s"
                    if (-not $portCheck) {
                        $portToUse = $currentPort
                        break
                    }
                }
            }

            if (-not $portCheck) {
                break
            }
        }
    }

    if ($portToUse -ne 8001) {
        Print-Warn "Port 8001 unavailable, using port $portToUse"
    }

    $BackendPort = $portToUse
    $env:ELENCHUS_BACKEND_PORT = "$BackendPort"
}

if (-not $BackendOnly) {
    if (-not $FrontendOnly -or -not $env:VITE_BACKEND_PORT) {
        $env:VITE_BACKEND_PORT = if ($FrontendOnly) { "8001" } else { "$BackendPort" }
    }
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
    Print-Info "Starting frontend service in this window..."
    Start-DelayedBrowser -Url "http://localhost:5173"
    npm run dev:frontend
} else {
    Print-Info "Starting backend and frontend in this window..."
    Start-DelayedBrowser -Url "http://localhost:5173"
    npm run dev:stack
}

Pop-Location
