$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release"
$appName = "ComfyUI Launcher Next"
$package = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$version = $package.version
$appDir = Join-Path $release "$appName-win32-x64"
$zipPath = Join-Path $release "$appName $version Portable.zip"
$electronDist = Join-Path $root "node_modules\electron\dist"

if (!(Test-Path $electronDist)) {
  throw "Electron runtime not found. Run npm install first."
}

Remove-Item -LiteralPath $release -Recurse -Force -ErrorAction SilentlyContinue
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
Copy-Item -Path (Join-Path $root "package.json"), (Join-Path $root "README.md"), (Join-Path $root "LICENSE") -Destination $app -Force

Compress-Archive -Path (Join-Path $appDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

$makensisCommand = Get-Command makensis.exe -ErrorAction SilentlyContinue
$makensis = if ($makensisCommand) { $makensisCommand.Source } else { $null }
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
    & $makensis "/DAPP_VERSION=$version" "build\installer.nsi"
  } finally {
    Pop-Location
  }
} else {
  Write-Warning "NSIS makensis.exe not found. Portable ZIP was created, installer was skipped."
}

Get-ChildItem $release | Select-Object Name, Length, LastWriteTime
