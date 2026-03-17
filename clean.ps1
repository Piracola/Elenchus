[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$Deep,
    [switch]$IncludeDatabase,
    [switch]$IncludeToolState
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-PathSizeBytes {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FullPath
    )

    $item = Get-Item -LiteralPath $FullPath -Force
    if (-not $item.PSIsContainer) {
        return [int64]$item.Length
    }

    $files = Get-ChildItem -LiteralPath $FullPath -Recurse -Force -File -ErrorAction SilentlyContinue
    $measure = $files | Measure-Object -Property Length -Sum
    if ($null -eq $measure.Sum) {
        return 0L
    }

    return [int64]$measure.Sum
}

function Add-Target {
    param(
        [System.Collections.Generic.List[object]]$List,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [switch]$Wildcard
    )

    $List.Add(
        [PSCustomObject]@{
            Path = $Path
            Label = $Label
            Wildcard = [bool]$Wildcard
        }
    ) | Out-Null
}

function Resolve-TargetItems {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Target
    )

    if ($Target.Wildcard) {
        $pattern = Join-Path $PSScriptRoot $Target.Path
        return @(Get-ChildItem -Path $pattern -Force -ErrorAction SilentlyContinue)
    }

    $fullPath = Join-Path $PSScriptRoot $Target.Path
    if (-not (Test-Path -LiteralPath $fullPath)) {
        return @()
    }

    return @(Get-Item -LiteralPath $fullPath -Force)
}

$targets = [System.Collections.Generic.List[object]]::new()
Add-Target -List $targets -Path "backend\.mypy_cache" -Label "mypy cache"
Add-Target -List $targets -Path "backend\.pytest_cache" -Label "pytest cache"
Add-Target -List $targets -Path "backend\.ruff_cache" -Label "ruff cache"
Add-Target -List $targets -Path "frontend\dist" -Label "frontend build output"
Add-Target -List $targets -Path "logs" -Label "root logs"
Add-Target -List $targets -Path "pytest-cache-files-*" -Label "pytest temp directories" -Wildcard

if ($Deep) {
    Add-Target -List $targets -Path "backend\venv" -Label "backend virtual environment"
    Add-Target -List $targets -Path "frontend\node_modules" -Label "frontend node_modules"
    Add-Target -List $targets -Path "node_modules" -Label "root node_modules"
}

if ($IncludeDatabase) {
    Add-Target -List $targets -Path "backend\elenchus.db" -Label "local backend database"
}

if ($IncludeToolState) {
    Add-Target -List $targets -Path ".opencode" -Label "Codex tool state"
}

$freedBytes = 0L
$removed = [System.Collections.Generic.List[object]]::new()
$failed = [System.Collections.Generic.List[object]]::new()

foreach ($target in $targets) {
    $items = @(Resolve-TargetItems -Target $target)
    if ($items.Count -eq 0) {
        continue
    }

    foreach ($item in $items) {
        $sizeBytes = 0L
        try {
            $sizeBytes = Get-PathSizeBytes -FullPath $item.FullName
        } catch {
            $sizeBytes = 0L
        }

        $displaySize = [Math]::Round(($sizeBytes / 1MB), 2)
        $action = "Remove $($target.Label)"
        if (-not $PSCmdlet.ShouldProcess($item.FullName, $action)) {
            continue
        }

        try {
            Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction Stop
            $freedBytes += $sizeBytes
            $removed.Add(
                [PSCustomObject]@{
                    Path = $item.FullName
                    Label = $target.Label
                    SizeMB = $displaySize
                }
            ) | Out-Null
        } catch {
            $failed.Add(
                [PSCustomObject]@{
                    Path = $item.FullName
                    Label = $target.Label
                    Error = $_.Exception.Message
                }
            ) | Out-Null
        }
    }
}

if ($removed.Count -gt 0) {
    Write-Host ""
    Write-Host "Removed:"
    $removed | Format-Table -AutoSize
}

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "Failed:"
    $failed | Format-Table -AutoSize
}

Write-Host ""
Write-Host ("Approximate space freed: {0} MB" -f [Math]::Round(($freedBytes / 1MB), 2))
