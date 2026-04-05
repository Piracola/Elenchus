<#
.SYNOPSIS
    SearXNG Management Script for Elenchus
.DESCRIPTION
    Handles SearXNG Docker container lifecycle: start, stop, status, health check
#>

param(
    [ValidateSet("start", "stop", "restart", "status", "health", "logs", "clean")]
    [string]$Action = "start",
    [int]$HealthCheckTimeout = 60,
    [int]$HealthCheckInterval = 3
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

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$SearXNGDir = Join-Path $RootDir "searxng"
$DockerComposeFile = Join-Path $SearXNGDir "docker-compose.yml"
$SearXNGDataDir = Join-Path $RootDir "searxng-data"
$SearXNGUrl = "http://localhost:8080"

function Test-DockerInstalled {
    try {
        $null = docker --version 2>$null
        return $true
    } catch {
        return $false
    }
}

function Test-DockerComposeInstalled {
    try {
        $null = docker compose version 2>$null
        return $true
    } catch {
        try {
            $null = docker-compose --version 2>$null
            return $true
        } catch {
            return $false
        }
    }
}

function Test-SearXNGRunning {
    try {
        $output = docker ps --filter "name=elenchus-searxng" --format "{{.Names}}" 2>$null
        return ($output -eq "elenchus-searxng")
    } catch {
        return $false
    }
}

function Wait-SearXNGHealthy {
    param(
        [int]$Timeout = 60,
        [int]$Interval = 3
    )
    
    Print-Info "Waiting for SearXNG to become healthy..."
    $startTime = Get-Date
    $healthy = $false
    
    while (((Get-Date) - $startTime).TotalSeconds -lt $Timeout) {
        try {
            $response = Invoke-WebRequest -Uri "$SearXNGUrl/healthz" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                $healthy = $true
                break
            }
        } catch {
            # Container not ready yet, keep waiting
        }
        
        Start-Sleep -Seconds $Interval
        Write-Host "." -NoNewline
    }
    
    Write-Host ""
    
    if ($healthy) {
        Print-OK "SearXNG is healthy and ready at $SearXNGUrl"
        return $true
    } else {
        Print-Err "SearXNG failed to become healthy within ${Timeout}s"
        return $false
    }
}

function Start-SearXNG {
    if (-not (Test-DockerInstalled)) {
        Print-Err "Docker is not installed or not in PATH"
        Write-Host ""
        Print-Info "Please install Docker Desktop: https://www.docker.com/products/docker-desktop/"
        return $false
    }
    
    if (-not (Test-DockerComposeInstalled)) {
        Print-Err "Docker Compose is not available"
        return $false
    }
    
    if (Test-SearXNGRunning) {
        Print-OK "SearXNG is already running"
        return $true
    }
    
    Print-Info "Starting SearXNG container..."
    
    if (-not (Test-Path $SearXNGDataDir)) {
        Print-Info "Creating SearXNG data directory: $SearXNGDataDir"
        New-Item -ItemType Directory -Path $SearXNGDataDir -Force | Out-Null
    }
    
    Push-Location $SearXNGDir
    
    try {
        docker compose -f "$DockerComposeFile" up -d 2>&1
        if ($LASTEXITCODE -ne 0) {
            Print-Err "Failed to start SearXNG container"
            return $false
        }
        
        Print-OK "SearXNG container started"
        
        return Wait-SearXNGHealthy -Timeout $HealthCheckTimeout -Interval $HealthCheckInterval
    } finally {
        Pop-Location
    }
}

function Stop-SearXNG {
    if (-not (Test-SearXNGRunning)) {
        Print-Info "SearXNG is not running"
        return $true
    }
    
    Print-Info "Stopping SearXNG container..."
    
    Push-Location $SearXNGDir
    
    try {
        docker compose -f "$DockerComposeFile" down 2>&1
        if ($LASTEXITCODE -ne 0) {
            Print-Err "Failed to stop SearXNG container"
            return $false
        }
        
        Print-OK "SearXNG container stopped"
        return $true
    } finally {
        Pop-Location
    }
}

function Show-SearXNGStatus {
    Print-Info "SearXNG Status:"
    Write-Host ""
    
    if (Test-SearXNGRunning) {
        Print-OK "Status: "$BOLD"RUNNING"$RESET
        Write-Host "  URL: $SearXNGUrl"
        
        try {
            $response = docker ps --filter "name=elenchus-searxng" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>$null
            if ($response) {
                Write-Host ""
                Write-Host $response
            }
        } catch {
            # Ignore docker ps errors
        }
    } else {
        Print-Err "Status: "$BOLD"STOPPED"$RESET
    }
    
    Write-Host ""
    Write-Host "Data directory: $SearXNGDataDir"
    if (Test-Path $SearXNGDataDir) {
        $size = (Get-ChildItem $SearXNGDataDir -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        if ($size) {
            Write-Host "Data size: $([math]::Round($size / 1MB, 2)) MB"
        }
    } else {
        Write-Host "Data size: 0 MB (not created yet)"
    }
}

function Test-SearXNGHealth {
    Print-Info "Checking SearXNG health..."
    
    try {
        $response = Invoke-WebRequest -Uri "$SearXNGUrl/healthz" -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Print-OK "SearXNG is healthy"
            return $true
        } else {
            Print-Err "SearXNG returned status code: $($response.StatusCode)"
            return $false
        }
    } catch {
        Print-Err "SearXNG is not reachable: $_"
        return $false
    }
}

function Show-SearXNGLogs {
    if (-not (Test-SearXNGRunning)) {
        Print-Err "SearXNG is not running"
        return
    }
    
    Print-Info "Showing SearXNG logs (Ctrl+C to exit)..."
    Push-Location $RootDir
    
    try {
        docker compose logs -f --tail=100
    } finally {
        Pop-Location
    }
}

function Clean-SearXNGData {
    Print-Warn "This will remove all SearXNG data in: $SearXNGDataDir"
    Write-Host ""
    
    $confirm = Read-Host "Are you sure you want to clean SearXNG data? (yes/no)"
    if ($confirm -ne "yes") {
        Print-Info "Operation cancelled"
        return
    }
    
    if (Test-SearXNGRunning) {
        Print-Info "Stopping SearXNG first..."
        Stop-SearXNG | Out-Null
    }
    
    if (Test-Path $SearXNGDataDir) {
        Print-Info "Removing data directory..."
        Remove-Item -Path $SearXNGDataDir -Recurse -Force
        Print-OK "SearXNG data cleaned"
    } else {
        Print-Info "No data directory found"
    }
}

# Main execution
Write-Host ""
Write-Host $BOLD$CYAN"   SearXNG Management - Elenchus"$RESET
Write-Host ""

switch ($Action) {
    "start" {
        $success = Start-SearXNG
        if (-not $success) {
            exit 1
        }
    }
    "stop" {
        $success = Stop-SearXNG
        if (-not $success) {
            exit 1
        }
    }
    "restart" {
        Stop-SearXNG | Out-Null
        Start-Sleep -Seconds 2
        $success = Start-SearXNG
        if (-not $success) {
            exit 1
        }
    }
    "status" {
        Show-SearXNGStatus
    }
    "health" {
        $healthy = Test-SearXNGHealth
        if (-not $healthy) {
            exit 1
        }
    }
    "logs" {
        Show-SearXNGLogs
    }
    "clean" {
        Clean-SearXNGData
    }
}
