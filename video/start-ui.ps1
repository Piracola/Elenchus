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

if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
    Write-Step "Installing dependencies for first launch..."
    npm install
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Step "Service is already running. Opening browser."
    Start-Process $Url
    Write-Step "This launcher is not attached to the existing service window."
    Write-Step "Press Enter to close this window, or keep using the browser."
    Read-Host | Out-Null
    exit 0
}

Write-Step "Starting local web console..."
Write-Step "Keep this window open while using the console."
Write-Step "Close this window or press Ctrl+C to stop the service."

$waiterScript = @"
`$Url = "$Url"
for (`$i = 0; `$i -lt 60; `$i++) {
    Start-Sleep -Milliseconds 500
    try {
        `$response = Invoke-WebRequest -Uri "`$Url/api/current" -UseBasicParsing -TimeoutSec 2
        if (`$response.StatusCode -eq 200) {
            Start-Process `$Url
            exit 0
        }
    } catch {
    }
}
"@

Start-Process `
    -FilePath "$PSHOME\powershell.exe" `
    -ArgumentList @("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $waiterScript) `
    -WindowStyle Hidden

Write-Step "Server logs will appear below."
node scripts/ui-server.mjs
