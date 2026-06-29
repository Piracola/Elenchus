<#
.SYNOPSIS
    Elenchus portable Windows build script.
.DESCRIPTION
    Builds the frontend bundle, verifies backend startup, and produces a
    PyInstaller-based portable Windows release folder plus zip archive.
#>

param(
    [switch]$SkipInstall,
    [switch]$SkipBackendInstall,
    [switch]$SkipFrontendInstall,
    [switch]$SkipSmokeTest,
    [string]$Version,
    [string]$OutputDir,
    [switch]$IncludeRuntimeConfig,
    [string]$RuntimeConfigPath,
    [switch]$AllowLiveRuntimeConfig,
    [switch]$DryRun
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

function Write-Section {
    param(
        [string]$Step,
        [string]$Title
    )

    Write-Host ""
    Write-Host $CYAN"========================================"$RESET
    Write-Host $BOLD"${Step}: $Title"$RESET
    Write-Host $CYAN"========================================"$RESET
    Write-Host ""
}

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

function Resolve-AbsolutePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue,
        [Parameter(Mandatory = $true)]
        [string]$BasePath
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $PathValue))
}

function Test-PathsEqual {
    param(
        [Parameter(Mandatory = $true)]
        [string]$LeftPath,
        [Parameter(Mandatory = $true)]
        [string]$RightPath
    )

    return [string]::Equals(
        [System.IO.Path]::GetFullPath($LeftPath),
        [System.IO.Path]::GetFullPath($RightPath),
        [System.StringComparison]::OrdinalIgnoreCase
    )
}

function Get-PathFileId {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    try {
        $output = & fsutil file queryfileid $PathValue 2>$null
        if ($LASTEXITCODE -ne 0 -or $null -eq $output) {
            return $null
        }
        $match = [regex]::Match(($output | Out-String), 'File ID is (0x[0-9a-fA-F]+)')
        if (-not $match.Success) {
            return $null
        }
        return $match.Groups[1].Value.ToLowerInvariant()
    } catch {
        return $null
    }
}

function Get-HardLinkCount {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    $output = & fsutil hardlink list $PathValue 2>$null
    if ($LASTEXITCODE -ne 0 -or $null -eq $output) {
        return $null
    }

    $lines = @(
        $output | ForEach-Object { "$_".Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )

    return $lines.Count
}

function Get-ExistingFileItem {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $PathValue)) {
        throw "$Label not found: $PathValue"
    }

    $item = Get-Item -LiteralPath $PathValue -Force -ErrorAction Stop
    if ($item.PSIsContainer) {
        throw "$Label must be a file, not a directory: $PathValue"
    }

    return $item
}

function Test-PathIsLinked {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.FileSystemInfo]$Item
    )

    $linkType = "$($Item.LinkType)".Trim()
    if (-not [string]::IsNullOrWhiteSpace($linkType)) {
        return $true
    }

    return [bool]($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
}

function Test-PathHasLinkedAncestor {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    $currentPath = Split-Path -Path $PathValue -Parent
    while (-not [string]::IsNullOrWhiteSpace($currentPath)) {
        try {
            $ancestor = Get-Item -LiteralPath $currentPath -Force -ErrorAction Stop
            if (Test-PathIsLinked -Item $ancestor) {
                return $true
            }
        } catch {
            return $false
        }

        $nextPath = Split-Path -Path $currentPath -Parent
        if ($nextPath -eq $currentPath) {
            break
        }
        $currentPath = $nextPath
    }

    return $false
}

function Get-DefaultReleaseVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PackageJsonPath
    )

    if (-not (Test-Path $PackageJsonPath)) {
        return "dev"
    }

    try {
        $packageJson = Get-Content -Path $PackageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $detectedVersion = "$($packageJson.version)".Trim()
        if (-not [string]::IsNullOrWhiteSpace($detectedVersion)) {
            return $detectedVersion
        }
    } catch {
        Print-Warn "Failed to parse package.json version, defaulting to 'dev'"
    }

    return "dev"
}

function Format-CommandForDisplay {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$Arguments = @()
    )

    $parts = @($FilePath) + $Arguments
    $formattedParts = foreach ($part in $parts) {
        $text = [string]$part
        if ($text -match '[\s"]') {
            '"' + $text.Replace('"', '\"') + '"'
        } else {
            $text
        }
    }

    return ($formattedParts -join " ")
}

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory
    )

    Print-Info $Title
    $displayCommand = Format-CommandForDisplay -FilePath $FilePath -Arguments $Arguments
    if ($script:DryRun) {
        Print-Info ("Would run: " + $displayCommand)
    } else {
        Print-Info ("Running: " + $displayCommand)
    }

    if ($script:DryRun) {
        return
    }

    $exitCode = 0

    try {
        if ($WorkingDirectory) {
            Push-Location $WorkingDirectory
        }

        & $FilePath @Arguments
        $exitCode = $LASTEXITCODE
    } finally {
        if ($WorkingDirectory) {
            Pop-Location
        }
    }

    if ($exitCode -ne 0) {
        throw "Command failed with exit code $exitCode"
    }
}

function Stop-ProcessesByExecutablePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExecutablePath,
        [string]$Label = "process"
    )

    if ([string]::IsNullOrWhiteSpace($ExecutablePath) -or -not (Test-Path $ExecutablePath)) {
        return $false
    }

    $resolvedExecutablePath = [System.IO.Path]::GetFullPath($ExecutablePath)
    $matchingProcesses = @(
        Get-Process -ErrorAction SilentlyContinue | Where-Object {
            try {
                $processPath = $_.Path
                if ([string]::IsNullOrWhiteSpace($processPath)) {
                    $false
                } else {
                    [string]::Equals(
                        [System.IO.Path]::GetFullPath($processPath),
                        $resolvedExecutablePath,
                        [System.StringComparison]::OrdinalIgnoreCase
                    )
                }
            } catch {
                $false
            }
        }
    )

    if ($matchingProcesses.Count -eq 0) {
        return $false
    }

    $processIds = ($matchingProcesses | Select-Object -ExpandProperty Id) -join ", "
    Print-Warn "Stopping $Label process(es) that may lock build files: $processIds"

    if (-not $script:DryRun) {
        $matchingProcesses | Stop-Process -Force -ErrorAction Stop
        Start-Sleep -Milliseconds 500
    }

    return $true
}

function Install-FrontendDependencies {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NpmExecutable,
        [Parameter(Mandatory = $true)]
        [string]$FrontendDirectory,
        [Parameter(Mandatory = $true)]
        [string]$FrontendModulesDirectory,
        [Parameter(Mandatory = $true)]
        [string]$FrontendLockFilePath,
        [string]$EsbuildExecutablePath
    )

    $hasNodeModules = Test-Path $FrontendModulesDirectory
    $hasLockFile = Test-Path $FrontendLockFilePath

    $installArgs = if ((-not $hasNodeModules) -and $hasLockFile) {
        @("ci")
    } else {
        @("install")
    }

    if ($installArgs[0] -eq "install" -and $hasNodeModules -and $hasLockFile) {
        Print-Info "Using npm install because frontend/node_modules already exists; this avoids common Windows lock issues with npm ci."
    }

    Stop-ProcessesByExecutablePath -ExecutablePath $EsbuildExecutablePath -Label "frontend esbuild" | Out-Null

    try {
        Invoke-ExternalCommand `
            -Title "Installing frontend dependencies..." `
            -FilePath $NpmExecutable `
            -Arguments $installArgs `
            -WorkingDirectory $FrontendDirectory
    } catch {
        Print-Warn "Frontend dependency installation failed on the first attempt."
        $stoppedProcess = Stop-ProcessesByExecutablePath -ExecutablePath $EsbuildExecutablePath -Label "frontend esbuild"

        if (-not $hasNodeModules) {
            throw
        }

        if (-not $stoppedProcess -and $installArgs[0] -eq "install") {
            throw
        }

        Print-Warn "Retrying once with npm install after clearing local build helper processes."
        Invoke-ExternalCommand `
            -Title "Retrying frontend dependency installation..." `
            -FilePath $NpmExecutable `
            -Arguments @("install") `
            -WorkingDirectory $FrontendDirectory
    }
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

function Update-ReleaseArchive {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ReleaseRoot,
        [Parameter(Mandatory = $true)]
        [string]$ArchivePath,
        [Parameter(Mandatory = $true)]
        [string]$ChecksumPath
    )

    if ($script:DryRun) {
        return
    }

    if (Test-Path $ArchivePath) {
        Remove-Item -Path $ArchivePath -Force
    }

    Compress-Archive -Path $ReleaseRoot -DestinationPath $ArchivePath -CompressionLevel Optimal

    $hash = (Get-FileHash -Algorithm SHA256 -Path $ArchivePath).Hash.ToLowerInvariant()
    Set-Content -Path $ChecksumPath -Value "$hash  $(Split-Path -Leaf $ArchivePath)" -Encoding UTF8 -NoNewline
}

try {
    Clear-Host
} catch {
    # Non-interactive shells may not expose a valid RawUI cursor handle.
}
Write-Host ""
Write-Host $BOLD$CYAN"   __      _                _"$RESET
Write-Host $BOLD$CYAN"  / /_  __(_)___  ____     / /"$RESET
Write-Host $BOLD$CYAN" / __ \/ / / __ \/ __ \   / / "$RESET
Write-Host $BOLD$CYAN"/ /_/ / / / /_/ / /_/ /  /_/  "$RESET
Write-Host $BOLD$CYAN"\____/_/_/ .___/ .___/  (_)   "$RESET
Write-Host $BOLD$CYAN"         /_/   /_/             "$RESET
Write-Host ""
Write-Host $BOLD"   Elenchus Portable Build Script"$RESET
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = $ScriptDir
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$ScriptsDir = Join-Path $RootDir "scripts"
$VenvDir = Join-Path $BackendDir "venv"
$BackendPython = Join-Path $VenvDir "Scripts\python.exe"
$BackendRequirements = Join-Path $BackendDir "requirements.txt"
$BuildScript = Join-Path $ScriptsDir "build_pyinstaller_release.py"
$SmokeTestScript = Join-Path $ScriptsDir "smoke_test_release_backend.py"
$FrontendLockFile = Join-Path $FrontendDir "package-lock.json"
$FrontendModulesDir = Join-Path $FrontendDir "node_modules"
$FrontendEsbuildBinary = Join-Path $FrontendModulesDir "@esbuild\win32-x64\esbuild.exe"
$RuntimeConfigFile = Join-Path $RootDir "runtime\config.json"
$PackageJsonPath = Join-Path $RootDir "package.json"
$SelectedRuntimeConfigPath = $null
$SelectedRuntimeConfigItem = $null
$BundlingLiveRuntimeConfig = $false

# Runtime config bundling now requires an explicit source file, with an extra
# acknowledgement if that source is the live runtime/config.json in the repo.
if (-not $IncludeRuntimeConfig -and (-not [string]::IsNullOrWhiteSpace($RuntimeConfigPath) -or $AllowLiveRuntimeConfig)) {
    Print-Err "Runtime config bundling options require -IncludeRuntimeConfig."
    exit 1
}

if ($IncludeRuntimeConfig) {
    if ([string]::IsNullOrWhiteSpace($RuntimeConfigPath)) {
        Print-Err "Bundling a runtime config now requires -RuntimeConfigPath <sanitized-config.json>."
        Print-Info "The live runtime/config.json is blocked by default. To intentionally ship it, add -RuntimeConfigPath runtime/config.json -AllowLiveRuntimeConfig."
        exit 1
    }

    $SelectedRuntimeConfigPath = Resolve-AbsolutePath -PathValue $RuntimeConfigPath -BasePath $RootDir

    try {
        $SelectedRuntimeConfigItem = Get-ExistingFileItem -PathValue $SelectedRuntimeConfigPath -Label "Specified runtime config file"
        $SelectedRuntimeConfigPath = $SelectedRuntimeConfigItem.FullName
    } catch {
        Print-Err $_.Exception.Message
        exit 1
    }

    if (Test-PathIsLinked -Item $SelectedRuntimeConfigItem) {
        Print-Err "Runtime config source must be a standalone regular file, not a linked alias: $SelectedRuntimeConfigPath"
        Print-Info "Copy the config to a standalone file and pass that file via -RuntimeConfigPath."
        exit 1
    }

    if (Test-PathHasLinkedAncestor -PathValue $SelectedRuntimeConfigPath) {
        Print-Err "Runtime config source must not live under a symbolic link or junction: $SelectedRuntimeConfigPath"
        Print-Info "Copy the config to a standalone file and pass that file via -RuntimeConfigPath."
        exit 1
    }

    $selectedRuntimeConfigFileId = Get-PathFileId -PathValue $SelectedRuntimeConfigPath
    $liveRuntimeConfigFileId = Get-PathFileId -PathValue $RuntimeConfigFile
    if ($null -eq $selectedRuntimeConfigFileId -or $null -eq $liveRuntimeConfigFileId) {
        Print-Err "Unable to verify runtime config file identity for: $SelectedRuntimeConfigPath"
        Print-Info "Copy the config to a standalone file and pass that file via -RuntimeConfigPath."
        exit 1
    }

    if ($selectedRuntimeConfigFileId -eq $liveRuntimeConfigFileId) {
        $BundlingLiveRuntimeConfig = $true
    }

    $hardLinkCount = Get-HardLinkCount -PathValue $SelectedRuntimeConfigPath
    if ($null -eq $hardLinkCount) {
        Print-Err "Unable to verify that the runtime config source is not a hard-linked alias: $SelectedRuntimeConfigPath"
        Print-Info "Copy the config to a standalone file and pass that file via -RuntimeConfigPath."
        exit 1
    }

    if ($hardLinkCount -gt 1) {
        Print-Err "Runtime config source must be a standalone regular file, not a hard-linked alias: $SelectedRuntimeConfigPath"
        Print-Info "Copy the config to a standalone file and pass that file via -RuntimeConfigPath."
        exit 1
    }

    if ($BundlingLiveRuntimeConfig -and -not $AllowLiveRuntimeConfig) {
        Print-Err "Refusing to bundle the live runtime/config.json without -AllowLiveRuntimeConfig."
        Print-Info "Recommended: create a sanitized release config file and pass it via -RuntimeConfigPath."
        exit 1
    }

    if (-not $BundlingLiveRuntimeConfig -and $AllowLiveRuntimeConfig) {
        Print-Warn "-AllowLiveRuntimeConfig was provided, but the selected runtime config is not runtime/config.json."
    }
}

$EffectiveVersion = if ([string]::IsNullOrWhiteSpace($Version)) {
    Get-DefaultReleaseVersion -PackageJsonPath $PackageJsonPath
} else {
    $Version.Trim()
}

$EffectiveOutputDir = if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    Join-Path $RootDir "dist\releases"
} else {
    Resolve-AbsolutePath -PathValue $OutputDir -BasePath $RootDir
}

$ReleaseName = "elenchus-portable-$EffectiveVersion-windows"
$ReleaseRoot = Join-Path $EffectiveOutputDir $ReleaseName
$ArchivePath = Join-Path $EffectiveOutputDir "$ReleaseName.zip"
$ChecksumPath = "$ArchivePath.sha256"

$DoBackendInstall = -not ($SkipInstall -or $SkipBackendInstall)
$DoFrontendInstall = -not ($SkipInstall -or $SkipFrontendInstall)

Write-Section -Step "Step 1/6" -Title "Environment Check"

foreach ($requiredPath in @($BackendDir, $FrontendDir, $BuildScript, $SmokeTestScript, $BackendRequirements)) {
    if (-not (Test-Path $requiredPath)) {
        Print-Err "Missing required path: $requiredPath"
        exit 1
    }
}

$PythonRuntime = Resolve-PythonRuntime -PreferredPaths @($BackendPython)
if (-not $PythonRuntime) {
    Print-Err "Python not found or unusable, please install Python 3.10+"
    exit 1
}
Print-OK "Python $($PythonRuntime.Version) available via $($PythonRuntime.CommandLabel)"

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
    Print-Err "Node.js not found, please install Node.js 18+"
    exit 1
}
$NodePath = Resolve-CommandPath -Command $NodeCommand
$NodeVersion = Invoke-CommandCapture -FilePath $NodePath -Arguments @("--version")
if (-not $NodeVersion.Success) {
    Print-Err "Node.js is installed but unusable"
    exit 1
}
Print-OK "Node.js $($NodeVersion.Text.TrimStart('v')) installed"

$NpmCommand = Get-Command npm -ErrorAction SilentlyContinue
if (-not $NpmCommand) {
    Print-Err "npm not found"
    exit 1
}
$NpmPath = Resolve-CommandPath -Command $NpmCommand
$NpmVersion = Invoke-CommandCapture -FilePath $NpmPath -Arguments @("--version")
if (-not $NpmVersion.Success) {
    Print-Err "npm is installed but unusable"
    exit 1
}
Print-OK "npm $($NpmVersion.Text) installed"

if (-not $DoFrontendInstall -and -not (Test-FrontendDependencyInstallHealthy -FrontendDirectory $FrontendDir)) {
    Print-Err "Frontend dependencies are missing or incomplete. Re-run without -SkipInstall or -SkipFrontendInstall."
    exit 1
}

Write-Section -Step "Step 2/6" -Title "Prepare Backend Build Environment"

if (-not (Test-Path $BackendPython)) {
    $venvArgs = @()
    $venvArgs += $PythonRuntime.Arguments
    $venvArgs += "-m", "venv", $VenvDir
    Invoke-ExternalCommand `
        -Title "Creating backend virtual environment..." `
        -FilePath $PythonRuntime.FilePath `
        -Arguments $venvArgs `
        -WorkingDirectory $RootDir
    Print-OK "Backend virtual environment created"
} else {
    Print-OK "Backend virtual environment already exists"
}

$BuildPythonRuntime = Resolve-PythonRuntime -PreferredPaths @($BackendPython)
if (-not $BuildPythonRuntime) {
    Print-Err "Unable to resolve backend build Python runtime"
    exit 1
}

if ($DoBackendInstall) {
    $pipUpgradeArgs = @()
    $pipUpgradeArgs += $BuildPythonRuntime.Arguments
    $pipUpgradeArgs += "-m", "pip", "install", "--upgrade", "pip"
    Invoke-ExternalCommand `
        -Title "Upgrading pip in backend virtual environment..." `
        -FilePath $BuildPythonRuntime.FilePath `
        -Arguments $pipUpgradeArgs `
        -WorkingDirectory $RootDir

    $backendInstallArgs = @()
    $backendInstallArgs += $BuildPythonRuntime.Arguments
    $backendInstallArgs += "-m", "pip", "install", "-r", $BackendRequirements, "pyinstaller"
    Invoke-ExternalCommand `
        -Title "Installing backend runtime dependencies and PyInstaller..." `
        -FilePath $BuildPythonRuntime.FilePath `
        -Arguments $backendInstallArgs `
        -WorkingDirectory $RootDir

    if ($DryRun) {
        Print-Info "Backend build dependencies would be ready"
    } else {
        Print-OK "Backend build dependencies are ready"
    }
} else {
    Print-Warn "Skipping backend dependency installation"
}

Write-Section -Step "Step 3/6" -Title "Build Frontend Bundle"

if ($DoFrontendInstall) {
    if ((Test-Path $FrontendModulesDir) -and -not (Test-FrontendDependencyInstallHealthy -FrontendDirectory $FrontendDir)) {
        Print-Warn "Detected incomplete frontend dependencies; reinstalling packages."
    }

    Install-FrontendDependencies `
        -NpmExecutable $NpmPath `
        -FrontendDirectory $FrontendDir `
        -FrontendModulesDirectory $FrontendModulesDir `
        -FrontendLockFilePath $FrontendLockFile `
        -EsbuildExecutablePath $FrontendEsbuildBinary
    if ($DryRun) {
        Print-Info "Frontend dependencies would be installed"
    } else {
        Print-OK "Frontend dependencies installed"
    }
} else {
    Print-Warn "Skipping frontend dependency installation"
}

Invoke-ExternalCommand `
    -Title "Building frontend production bundle..." `
    -FilePath $NpmPath `
    -Arguments @("run", "build") `
    -WorkingDirectory $FrontendDir
if ($DryRun) {
    Print-Info "Frontend build would complete"
} else {
    Print-OK "Frontend build completed"
}

Write-Section -Step "Step 4/6" -Title "Smoke Test Packaged Backend"

if ($SkipSmokeTest) {
    Print-Warn "Skipping release backend smoke test"
} else {
    $smokeArgs = @()
    $smokeArgs += $BuildPythonRuntime.Arguments
    $smokeArgs += $SmokeTestScript
    Invoke-ExternalCommand `
        -Title "Running release backend smoke test..." `
        -FilePath $BuildPythonRuntime.FilePath `
        -Arguments $smokeArgs `
        -WorkingDirectory $RootDir
    if ($DryRun) {
        Print-Info "Release backend smoke test would pass"
    } else {
        Print-OK "Release backend smoke test passed"
    }
}

Write-Section -Step "Step 5/6" -Title "Build Portable Backend Release"

$buildArgs = @()
$buildArgs += $BuildPythonRuntime.Arguments
$buildArgs += $BuildScript
if (-not [string]::IsNullOrWhiteSpace($EffectiveVersion)) {
    $buildArgs += "--version", $EffectiveVersion
}
if (-not [string]::IsNullOrWhiteSpace($EffectiveOutputDir)) {
    $buildArgs += "--output-dir", $EffectiveOutputDir
}
if ($IncludeRuntimeConfig) {
    $buildArgs += "--include-runtime-config"
    $buildArgs += "--runtime-config-path", $SelectedRuntimeConfigPath
    if ($AllowLiveRuntimeConfig) {
        $buildArgs += "--allow-live-runtime-config"
    }
}

Invoke-ExternalCommand `
    -Title "Building portable Windows release with PyInstaller..." `
    -FilePath $BuildPythonRuntime.FilePath `
    -Arguments $buildArgs `
    -WorkingDirectory $RootDir

Write-Section -Step "Step 6/6" -Title "Smoke Test Release Artifact"

if ($SkipSmokeTest) {
    Print-Warn "Skipping packaged release smoke tests"
} else {
    $packagedSmokeArgs = @()
    $packagedSmokeArgs += $BuildPythonRuntime.Arguments
    $packagedSmokeArgs += $SmokeTestScript
    $packagedSmokeArgs += "--release-archive", $ArchivePath
    Invoke-ExternalCommand `
        -Title "Running packaged release smoke test..." `
        -FilePath $BuildPythonRuntime.FilePath `
        -Arguments $packagedSmokeArgs `
        -WorkingDirectory $RootDir
    if ($DryRun) {
        Print-Info "Packaged release smoke test would pass"
    } else {
        Print-OK "Packaged release smoke test passed"
    }
}

Write-Host ""
Write-Host $CYAN"========================================"$RESET
Write-Host $BOLD"Build Complete"$RESET
Write-Host $CYAN"========================================"$RESET
Write-Host ""

if ($DryRun) {
    Print-Info "Dry run finished. No mutating commands were executed."
} else {
    Print-OK "Release folder: $ReleaseRoot"
    Print-OK "Release zip: $ArchivePath"
    Print-OK "SHA256 file: $ChecksumPath"
}
