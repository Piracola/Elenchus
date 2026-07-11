$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 4317
$Url = "http://127.0.0.1:$Port"

function Write-Step {
    param([string]$Message)
    Write-Host "[Elenchus Video] $Message"
}

function Test-Command {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

Set-Location $RootDir

if (-not (Test-Command "node")) {
    throw "Node.js was not found. Please install Node.js or add node to PATH."
}

if (-not (Test-Command "npm")) {
    throw "npm was not found. Please install Node.js/npm or add npm to PATH."
}

$VenvDir = Join-Path $RootDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    if (-not (Test-Command "python")) {
        throw "Python was not found. Edge TTS needs Python. Please install Python 3 or add python to PATH."
    }
    Write-Step "Creating the local Python environment..."
    python -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to create .venv. Please verify that Python includes the venv module."
    }
}

if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
    Write-Step "Installing dependencies for first launch..."
    npm install
}

$EdgeTtsAvailable = $false
try {
    & $VenvPython -c "import edge_tts" 2>$null | Out-Null
    $EdgeTtsAvailable = $LASTEXITCODE -eq 0
} catch {
    $EdgeTtsAvailable = $false
}
if (-not $EdgeTtsAvailable) {
    Write-Step "Installing the pinned Edge TTS dependency..."
    & $VenvPython -m pip install --disable-pip-version-check -r (Join-Path $RootDir "requirements.txt")
    if ($LASTEXITCODE -ne 0) {
        throw "edge-tts installation failed. Please check the network and run the launcher again."
    }
}
$env:PYTHON = $VenvPython
$PidFile = Join-Path $RootDir ".video-ui.pid"

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    $Healthy = $false
    try {
        $healthResponse = Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 3
        if ($healthResponse.StatusCode -eq 200) {
            $healthPayload = $healthResponse.Content | ConvertFrom-Json
            $Healthy = $healthPayload.ok -eq $true
        }
    } catch {
    }
    if ($Healthy) {
        Write-Step "Service is already running and healthy. Opening browser."
        if ($env:ELENCHUS_NO_BROWSER -ne "1") {
            Start-Process $Url
        }
        exit 0
    }
    $OwnerPids = @($existing | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
    throw "Port $Port is occupied by another or unhealthy process. PID: $OwnerPids. The launcher will not stop it automatically."
}

if (Test-Path $PidFile) {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

Write-Step "Starting local web console..."
Write-Step "Keep this window open while using the console."
Write-Step "Close this window or press Ctrl+C to stop the service."

Write-Step "Server logs will appear below."
$TsxPackage = Join-Path $RootDir "node_modules\tsx\package.json"
if (-not (Test-Path $TsxPackage)) {
    throw "tsx was not found in node_modules. Please run npm install in the video directory."
}

$NodeExe = (Get-Command node).Source
$ServerProcess = $null
try {
    $ServerProcess = Start-Process `
        -FilePath $NodeExe `
        -ArgumentList @("--import", "tsx", "scripts/ui-server.mjs") `
        -WorkingDirectory $RootDir `
        -NoNewWindow `
        -PassThru

    $Ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        if ($ServerProcess.HasExited) {
            throw "The video service exited during startup with code $($ServerProcess.ExitCode)."
        }
        try {
            $response = Invoke-WebRequest -Uri "$Url/api/current" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                $Ready = $true
                break
            }
        } catch {
        }
    }
    if (-not $Ready) {
        throw "The video service did not become ready within 30 seconds."
    }

    $HealthResponse = Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 5
    $HealthPayload = $HealthResponse.Content | ConvertFrom-Json
    if ($HealthResponse.StatusCode -ne 200 -or $HealthPayload.ok -ne $true) {
        $FailedChecks = @($HealthPayload.checks | Where-Object { $_.ok -ne $true } | ForEach-Object { "$($_.name): $($_.detail)" }) -join "; "
        throw "Video runtime dependency check failed. $FailedChecks"
    }

    Start-Process $Url
    Wait-Process -Id $ServerProcess.Id
    exit $ServerProcess.ExitCode
} finally {
    if ($ServerProcess -and -not $ServerProcess.HasExited) {
        & taskkill.exe /PID $ServerProcess.Id /T /F 2>$null | Out-Null
    }
    if (Test-Path $PidFile) {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }
}
