<#
.SYNOPSIS
    Elenchus AI Debate Framework - One-Click Start Script
.DESCRIPTION
    Auto check environment, install dependencies and start services
#>

param(
    [switch]$SkipInstall,
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$SkipSearXNG
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

function Resolve-CommandPath {
    param(
        [Parameter(Mandatory = $true)]
        $Command
    )

    foreach ($property in @("Source", "Path", "Definition", "Name")) {
        $value = $Command.$property
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }

    return $null
}

function Invoke-CommandCapture {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$Arguments = @()
    )

    $previousErrorActionPreference = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"
        $output = & $FilePath @Arguments 2>&1
        $exitCode = $LASTEXITCODE
        $lines = @()

        if ($null -ne $output) {
            $lines = @(
                $output | ForEach-Object {
                    if ($_ -is [System.Management.Automation.ErrorRecord]) {
                        $_.ToString()
                    } else {
                        "$_"
                    }
                }
            )
        }

        return [pscustomobject]@{
            Success  = ($exitCode -eq 0)
            ExitCode = $exitCode
            Text     = ($lines -join "`n").Trim()
        }
    } catch {
        return [pscustomobject]@{
            Success  = $false
            ExitCode = $null
            Text     = $_.Exception.Message.Trim()
        }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Resolve-PythonRuntime {
    param(
        [string[]]$PreferredPaths = @()
    )

    $candidates = @()

    foreach ($preferredPath in $PreferredPaths) {
        if ([string]::IsNullOrWhiteSpace($preferredPath) -or -not (Test-Path $preferredPath)) {
            continue
        }

        $candidates += [pscustomobject]@{
            CommandLabel = $preferredPath
            FilePath     = $preferredPath
            Arguments    = @()
        }
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        $candidates += [pscustomobject]@{
            CommandLabel = "python"
            FilePath     = Resolve-CommandPath -Command $pythonCmd
            Arguments    = @()
        }
    }

    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) {
        $pyPath = Resolve-CommandPath -Command $pyCmd
        $candidates += [pscustomobject]@{
            CommandLabel = "py -3"
            FilePath     = $pyPath
            Arguments    = @("-3")
        }
        $candidates += [pscustomobject]@{
            CommandLabel = "py"
            FilePath     = $pyPath
            Arguments    = @()
        }
    }

    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate.FilePath)) {
            continue
        }

        $versionResult = Invoke-CommandCapture -FilePath $candidate.FilePath -Arguments ($candidate.Arguments + @("--version"))
        if (-not $versionResult.Success -or [string]::IsNullOrWhiteSpace($versionResult.Text)) {
            continue
        }

        if ($versionResult.Text -match "Python\s+([0-9][^\s]*)") {
            return [pscustomobject]@{
                CommandLabel = $candidate.CommandLabel
                FilePath     = $candidate.FilePath
                Arguments    = $candidate.Arguments
                Version      = $Matches[1]
            }
        }
    }

    return $null
}

function Get-ExecutableVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName,
        [string[]]$VersionArguments = @("--version"),
        [string]$PrefixToTrim = ""
    )

    $command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if (-not $command) {
        return $null
    }

    $commandPath = Resolve-CommandPath -Command $command
    if ([string]::IsNullOrWhiteSpace($commandPath)) {
        return $null
    }

    $versionResult = Invoke-CommandCapture -FilePath $commandPath -Arguments $VersionArguments
    if (-not $versionResult.Success -or [string]::IsNullOrWhiteSpace($versionResult.Text)) {
        return $null
    }

    $version = $versionResult.Text.Trim()
    if ($PrefixToTrim -and $version.StartsWith($PrefixToTrim)) {
        $version = $version.Substring($PrefixToTrim.Length)
    }

    return [pscustomobject]@{
        CommandName = $CommandName
        FilePath    = $commandPath
        Version     = $version
    }
}

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

function Test-FrontendDependencyInstallHealthy {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FrontendDirectory
    )

    $nodeModulesDir = Join-Path $FrontendDirectory "node_modules"
    if (-not (Test-Path $nodeModulesDir)) {
        return $false
    }

    $vitePackageDir = Join-Path $nodeModulesDir "vite"
    $vitePackageJson = Join-Path $vitePackageDir "package.json"
    $viteBin = Join-Path $nodeModulesDir ".bin\vite.cmd"

    return (Test-Path $vitePackageDir) -and (Test-Path $vitePackageJson) -and (Test-Path $viteBin)
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

function Test-EnvCacheValid {
    param(
        [string]$CacheFile
    )

    if (-not (Test-Path $CacheFile)) {
        return $false
    }

    $cacheTime = (Get-Item $CacheFile).LastWriteTime
    $age = (Get-Date) - $cacheTime
    # Cache valid for 24 hours
    return $age.TotalHours -lt 24
}

function Get-CachedEnvCheck {
    param(
        [string]$CacheFile
    )

    if (Test-EnvCacheValid -CacheFile $CacheFile) {
        return (Get-Content $CacheFile -Raw -ErrorAction SilentlyContinue)
    }
    return $null
}

function Save-EnvCache {
    param(
        [string]$CacheFile,
        [string]$Content
    )

    $stateDir = Split-Path -Parent $CacheFile
    if ($stateDir -and -not (Test-Path $stateDir)) {
        New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    }

    Set-Content -Path $CacheFile -Value $Content -NoNewline
}

function Test-DockerInstalled {
    try {
        $null = docker --version 2>$null
        return $true
    } catch {
        return $false
    }
}

function Test-SearXNGHealthy {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/healthz" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        return ($response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Start-SearXNGInBackground {
    if ($SkipSearXNG) {
        Print-Info "Skipping SearXNG startup (user requested)"
        return
    }

    if (-not (Test-DockerInstalled)) {
        Print-Warn "Docker not installed - SearXNG will be unavailable"
        return
    }

    if (Test-SearXNGHealthy) {
        Print-OK "SearXNG is already running and healthy"
        return
    }

    $searxngScript = Join-Path $RootDir "scripts\start_searxng.ps1"
    if (-not (Test-Path $searxngScript)) {
        Print-Warn "SearXNG management script not found"
        return
    }

    Print-Info "Starting SearXNG service in background..."

    # Launch SearXNG in a background PowerShell process
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $searxngScript, "start" `
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
Write-Host $BOLD"   AI Debate Framework - One-Click Start"$RESET
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = $ScriptDir
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$VenvDir = Join-Path $BackendDir "venv"
$RuntimeDir = Join-Path $RootDir "runtime"
$InstallStateDir = Join-Path $RuntimeDir ".install-state"

$BackendPython = Join-Path $VenvDir "Scripts\python.exe"
$BackendStateFile = Join-Path $InstallStateDir "backend.txt"
$FrontendStateFile = Join-Path $InstallStateDir "frontend.txt"
$EnvCacheFile = Join-Path $InstallStateDir "env-check.txt"
$BackendDependencyFiles = @(
    (Join-Path $BackendDir "requirements.txt")
)
$FrontendDependencyFiles = @(
    (Join-Path $FrontendDir "package.json"),
    (Join-Path $FrontendDir "package-lock.json")
)

# ── Step 1: Environment Check (cached) ──

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 1/4: Environment Check"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

$checksPassed = $true
$PythonRuntime = $null

$cachedEnv = Get-CachedEnvCheck -CacheFile $EnvCacheFile

if ($null -ne $cachedEnv) {
    Print-OK "Environment check passed (cached)"
    # Still need PythonRuntime for backend setup
    if (-not $FrontendOnly) {
        $PythonRuntime = Resolve-PythonRuntime -PreferredPaths @($BackendPython)
        if (-not $PythonRuntime) {
            Print-Err "Python not found or unusable, please install Python 3.10+"
            $checksPassed = $false
        }
    }
} else {
    if (-not $FrontendOnly) {
        Write-Host "Checking Python..."
        $PythonRuntime = Resolve-PythonRuntime -PreferredPaths @($BackendPython)
        if ($PythonRuntime) {
            Print-OK "Python $($PythonRuntime.Version) installed"
        } else {
            Print-Err "Python not found or unusable, please install Python 3.10+"
            $checksPassed = $false
        }

        Write-Host "Checking pip..."
        if ($PythonRuntime) {
            $pipVersionResult = Invoke-CommandCapture -FilePath $PythonRuntime.FilePath -Arguments ($PythonRuntime.Arguments + @("-m", "pip", "--version"))
        } else {
            $pipVersionResult = $null
        }

        if ($pipVersionResult -and $pipVersionResult.Success -and -not [string]::IsNullOrWhiteSpace($pipVersionResult.Text)) {
            Print-OK "pip installed"
        } else {
            Print-Err "pip not found"
            $checksPassed = $false
        }
    }

    if (-not $BackendOnly) {
        Write-Host "Checking Node.js..."
        $nodeInfo = Get-ExecutableVersion -CommandName "node" -PrefixToTrim "v"
        if ($nodeInfo) {
            Print-OK "Node.js $($nodeInfo.Version) installed"
        } else {
            Print-Err "Node.js not found or unusable, please install Node.js 18+"
            $checksPassed = $false
        }

        Write-Host "Checking npm..."
        $npmInfo = Get-ExecutableVersion -CommandName "npm"
        if ($npmInfo) {
            Print-OK "npm installed"
        } else {
            Print-Err "npm not found"
            $checksPassed = $false
        }
    }

    if ($checksPassed) {
        Save-EnvCache -CacheFile $EnvCacheFile -Content "passed"
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

# ── Step 2: Backend Setup ──

if (-not $FrontendOnly) {
    Write-Host ""
    Write-Host $CYAN"========================================"$RESET
    Write-Host $BOLD"Step 2/4: Backend Setup"$RESET
    Write-Host $CYAN"========================================"$RESET
    Write-Host ""

    Push-Location $BackendDir

    $venvCreated = $false

    if (-not (Test-Path $BackendPython)) {
        Print-Info "Creating Python virtual environment..."
        $venvArgs = @()
        $venvArgs += $PythonRuntime.Arguments
        $venvArgs += "-m", "venv", $VenvDir
        & $PythonRuntime.FilePath @venvArgs
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
            & $BackendPython -m pip install --disable-pip-version-check --quiet -r requirements.txt
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

# ── Step 3: Frontend Setup ──

if (-not $BackendOnly) {
    Write-Host ""
    Write-Host $CYAN"========================================"$RESET
    Write-Host $BOLD"Step 3/4: Frontend Setup"$RESET
    Write-Host $CYAN"========================================"$RESET
    Write-Host ""

    Push-Location $FrontendDir

    $frontendModulesDir = Join-Path $FrontendDir "node_modules"
    $frontendDependenciesHealthy = Test-FrontendDependencyInstallHealthy -FrontendDirectory $FrontendDir
    $frontendInstallNeeded = (-not $frontendDependenciesHealthy) -or (Test-DependencyRefreshNeeded -StateFile $FrontendStateFile -DependencyFiles $FrontendDependencyFiles)

    if ($frontendInstallNeeded) {
        if ($SkipInstall) {
            if (-not $frontendDependenciesHealthy) {
                Print-Err "Frontend dependencies are missing or incomplete. Run once without -SkipInstall."
                exit 1
            }

            Print-Warn "Frontend dependency files changed, but installation was skipped"
        } else {
            if ((Test-Path $frontendModulesDir) -and (-not $frontendDependenciesHealthy)) {
                Print-Warn "Detected incomplete frontend dependencies; reinstalling packages."
            }

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

# ── Step 4: Starting Services ──

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Step 4/4: Starting Services"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

# Start SearXNG in background (non-blocking)
if (-not $FrontendOnly -and -not $BackendOnly) {
    Start-SearXNGInBackground
}

$BackendPort = 8001
$env:ELENCHUS_BACKEND_PORT = "$BackendPort"

if (-not $BackendOnly) {
    $env:VITE_BACKEND_PORT = "$BackendPort"
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
if (-not $FrontendOnly -and -not $BackendOnly -and -not $SkipSearXNG) {
    if (Test-SearXNGHealthy) {
        Write-Host "    SearXNG:      "$BOLD"http://localhost:8080"$RESET
    }
}
Write-Host ""

if (-not $FrontendOnly) {
    Print-Warn "First time? Open the web UI and add your model provider API Keys there"
}
Write-Host ""

Write-Host "  "$CYAN"Press Ctrl+C to stop all services"$RESET
Write-Host ""

Push-Location $RootDir

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
