param([switch]$SkipPortableDirectory)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release"
$appName = "ComfyUI Launcher Next"
$package = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$version = $package.version
$stagingRoot = Join-Path $release ".staging-$PID"
$appDir = Join-Path $stagingRoot "$appName-win32-x64"
$portableDir = Join-Path $release "$appName $version Portable"
$legacyAppDir = Join-Path $release "$appName-win32-x64"
$zipPath = Join-Path $release "$appName $version Portable.zip"
$electronDist = Join-Path $root "node_modules\electron\dist"

function Remove-PathWithRetry {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Attempts = 12
  )

  $resolvedTarget = [System.IO.Path]::GetFullPath($Path)
  $allowedRoot = [System.IO.Path]::GetFullPath($release).TrimEnd('\') + '\'
  if (!$resolvedTarget.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a path outside release: $resolvedTarget"
  }

  if (!(Test-Path $Path)) {
    return
  }

  for ($index = 1; $index -le $Attempts; $index++) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return
    } catch {
      if ($index -eq $Attempts) {
        throw "Failed to remove $Path. Close any running $appName windows and retry. $($_.Exception.Message)"
      }
      Start-Sleep -Milliseconds 500
    }
  }
}

function Assert-PackageComplete([string]$Directory) {
  foreach ($relative in @("$appName.exe", "resources\app\package.json", "resources\app\dist\index.html", "resources\app\dist-electron\main.js", "resources\app\dist-electron\preload.js", "resources\app\dist-electron\configWriter.js", "resources\app\electron\app-icon.ico")) {
    $file = Join-Path $Directory $relative
    if (!(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -eq 0) {
      throw "Incomplete package: $file"
    }
  }
  if (!(Get-ChildItem -LiteralPath (Join-Path $Directory "resources\app\dist\assets") -Filter *.js)) {
    throw "Package contains no frontend JavaScript assets: $Directory"
  }
}

if (!(Test-Path $electronDist)) {
  throw "Electron runtime not found. Run npm install first."
}

$sourceElectronExe = Join-Path $electronDist "electron.exe"
if (!(Test-Path $sourceElectronExe)) {
  $electronInstall = Join-Path $root "node_modules\electron\install.js"
  if (Test-Path $electronInstall) {
    Remove-Item -LiteralPath $electronDist -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $root "node_modules\electron\path.txt") -Force -ErrorAction SilentlyContinue
    $env:npm_config_platform = "win32"
    $env:npm_config_arch = "x64"
    $env:force_no_cache = "true"
    & node $electronInstall
  }
}

if (!(Test-Path $sourceElectronExe)) {
  $electronPackage = Get-Content (Join-Path $root "node_modules\electron\package.json") -Raw | ConvertFrom-Json
  $electronVersion = $electronPackage.version
  $electronZip = Join-Path $env:TEMP "electron-v$electronVersion-win32-x64.zip"
  $electronUrl = "https://github.com/electron/electron/releases/download/v$electronVersion/electron-v$electronVersion-win32-x64.zip"
  Remove-Item -LiteralPath $electronDist -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $electronDist | Out-Null
  Invoke-WebRequest -Uri $electronUrl -OutFile $electronZip
  Expand-Archive -LiteralPath $electronZip -DestinationPath $electronDist -Force
  Remove-Item -LiteralPath $electronZip -Force -ErrorAction SilentlyContinue
}

if (!(Test-Path $sourceElectronExe)) {
  throw "electron.exe was not found in $electronDist"
}

New-Item -ItemType Directory -Path $release -Force | Out-Null
Remove-PathWithRetry -Path $stagingRoot
if (!$SkipPortableDirectory) { Remove-PathWithRetry -Path $portableDir }
Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $appDir | Out-Null

Get-ChildItem -LiteralPath $electronDist -Force | Copy-Item -Destination $appDir -Recurse -Force
$electronExe = Join-Path $appDir "electron.exe"
if (!(Test-Path $electronExe)) {
  throw "electron.exe was not copied from $electronDist"
}
Rename-Item -LiteralPath $electronExe -NewName "$appName.exe"

$app = Join-Path $appDir "resources\app"
New-Item -ItemType Directory -Path $app | Out-Null
Copy-Item -Path (Join-Path $root "dist") -Destination $app -Recurse -Force
Copy-Item -Path (Join-Path $root "dist-electron") -Destination $app -Recurse -Force
Copy-Item -Path (Join-Path $root "electron") -Destination $app -Recurse -Force
Copy-Item -Path (Join-Path $root "package.json"), (Join-Path $root "README.md"), (Join-Path $root "LICENSE") -Destination $app -Force
Assert-PackageComplete $appDir

if (!$SkipPortableDirectory) {
  New-Item -ItemType Directory -Path $portableDir -Force | Out-Null
  Copy-Item -Path (Join-Path $appDir "*") -Destination $portableDir -Recurse -Force
  Assert-PackageComplete $portableDir
} else {
  Write-Host "Keeping the existing portable directory unchanged; packaging from staging."
}
Compress-Archive -Path (Join-Path $appDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

$makensisCommand = Get-Command makensis.exe -ErrorAction SilentlyContinue
$makensis = if ($makensisCommand) { $makensisCommand.Source } else { $null }
if (!$makensis) {
  $chocoNsis = Join-Path ${env:ProgramFiles(x86)} "NSIS\makensis.exe"
  if (Test-Path $chocoNsis) { $makensis = $chocoNsis }
}
if (!$makensis) {
  $cached = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\nsis\nsis-3.0.4.1-nsis-3.0.4.1\Bin\makensis.exe"
  if (Test-Path $cached) { $makensis = $cached }
}
if (!$makensis) {
  $cached = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\nsis\nsis-3.0.4.1-nsis-3.0.4.1\makensis.exe"
  if (Test-Path $cached) { $makensis = $cached }
}

if ($makensis) {
  Push-Location $root
  try {
    & $makensis "/DAPP_VERSION=$version" "/DAPP_DIR=$appDir" "build\installer.nsi"
    if ($LASTEXITCODE -ne 0) {
      throw "NSIS makensis.exe failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Warning "NSIS makensis.exe not found. Portable ZIP was created, installer was skipped."
}

$installerPath = Join-Path $release "$appName Setup $version.exe"
$checksumAssets = @($zipPath)
if (Test-Path -LiteralPath $installerPath) { $checksumAssets += $installerPath }
$checksumLines = foreach ($asset in $checksumAssets) {
  $hash = (Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $([System.IO.Path]::GetFileName($asset))"
}
$checksumLines | Set-Content -LiteralPath (Join-Path $release "SHA256SUMS.txt") -Encoding ascii
if ($env:GITHUB_ACTIONS -eq "true" -and !(Test-Path $installerPath)) {
  throw "Installer was not created in GitHub Actions: $installerPath"
}

Get-ChildItem $release | Select-Object Name, Length, LastWriteTime

Remove-PathWithRetry -Path $legacyAppDir
Remove-PathWithRetry -Path $stagingRoot
