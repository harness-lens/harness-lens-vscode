# SPDX-License-Identifier: MPL-2.0
# Copyright © 2026 Cristian Camargo Filho

[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "HarnessLens"),
  [string]$VsCodeCommand = "code"
)

$ErrorActionPreference = "Stop"
$extensionId = "harness-lens.harness-lens"

if (-not $env:LOCALAPPDATA -and -not $PSBoundParameters.ContainsKey("InstallRoot")) {
  throw "LOCALAPPDATA is unavailable. Pass -InstallRoot explicitly."
}
if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  throw "InstallRoot cannot be empty."
}

$installedExtensions = @(& $VsCodeCommand --list-extensions)
if ($LASTEXITCODE -ne 0) {
  throw "VS Code could not list installed extensions (exit code $LASTEXITCODE)."
}
if ($installedExtensions -contains $extensionId) {
  & $VsCodeCommand --uninstall-extension $extensionId
  if ($LASTEXITCODE -ne 0) {
    throw "VS Code could not uninstall $extensionId (exit code $LASTEXITCODE)."
  }
}

Get-Process "harness-lens-lsp" -ErrorAction SilentlyContinue | Stop-Process -Force

$binRoot = Join-Path $InstallRoot "bin"
$knownFiles = @(
  (Join-Path $binRoot "harness-lens-lsp.exe"),
  (Join-Path $InstallRoot "install.json"),
  (Join-Path $InstallRoot "uninstall-harness-lens.ps1")
)
foreach ($knownFile in $knownFiles) {
  Remove-Item -LiteralPath $knownFile -Force -ErrorAction SilentlyContinue
}

foreach ($directory in @($binRoot, $InstallRoot)) {
  if ((Test-Path -LiteralPath $directory -PathType Container) -and
      @(Get-ChildItem -LiteralPath $directory -Force).Count -eq 0) {
    Remove-Item -LiteralPath $directory -Force
  }
}

Write-Host "Harness Lens was uninstalled. VS Code settings were preserved."
