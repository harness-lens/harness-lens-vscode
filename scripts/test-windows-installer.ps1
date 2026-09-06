# SPDX-License-Identifier: MPL-2.0
# Copyright © 2026 Cristian Camargo Filho

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("harness-lens-installer-test-" + [guid]::NewGuid().ToString("N"))
$fixtureRoot = Join-Path $temporaryRoot "fixtures"
$installRoot = Join-Path $temporaryRoot "installed"
$statePath = Join-Path $temporaryRoot "extension-installed"
$logPath = Join-Path $temporaryRoot "code.log"

New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null

try {
  $vsixPath = Join-Path $fixtureRoot "harness-lens.vsix"
  $serverPath = Join-Path $fixtureRoot "harness-lens-lsp.exe"
  $fakeCodePath = Join-Path $fixtureRoot "code.ps1"
  $checksumPath = Join-Path $fixtureRoot "SHA256SUMS"
  $uninstallerPath = Join-Path $PSScriptRoot "uninstall-harness-lens.ps1"

  Set-Content -LiteralPath $vsixPath -Value "test VSIX" -Encoding ASCII
  Set-Content -LiteralPath $serverPath -Value "test language server" -Encoding ASCII
  @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArguments)
Add-Content -LiteralPath $env:HARNESS_LENS_TEST_LOG -Value ($CliArguments -join " ")
if ($CliArguments[0] -eq "--install-extension") {
  Set-Content -LiteralPath $env:HARNESS_LENS_TEST_STATE -Value "installed"
} elseif ($CliArguments[0] -eq "--list-extensions") {
  if (Test-Path -LiteralPath $env:HARNESS_LENS_TEST_STATE) {
    Write-Output "harness-lens.harness-lens"
  }
} elseif ($CliArguments[0] -eq "--uninstall-extension") {
  Remove-Item -LiteralPath $env:HARNESS_LENS_TEST_STATE -Force
}
exit 0
'@ | Set-Content -LiteralPath $fakeCodePath -Encoding UTF8

  $checksumLines = @()
  foreach ($path in @($vsixPath, $serverPath, $uninstallerPath)) {
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    $checksumLines += "$hash  $(Split-Path -Leaf $path)"
  }
  $checksumLines | Set-Content -LiteralPath $checksumPath -Encoding ASCII

  $env:HARNESS_LENS_TEST_LOG = $logPath
  $env:HARNESS_LENS_TEST_STATE = $statePath

  & (Join-Path $PSScriptRoot "install-harness-lens.ps1") `
    -InstallRoot $installRoot `
    -VsCodeCommand $fakeCodePath `
    -VsixPath $vsixPath `
    -LanguageServerPath $serverPath `
    -UninstallerPath $uninstallerPath `
    -ChecksumPath $checksumPath

  if (-not (Test-Path -LiteralPath (Join-Path $installRoot "bin\harness-lens-lsp.exe") -PathType Leaf)) {
    throw "Installer did not copy the language server."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $installRoot "uninstall-harness-lens.ps1") -PathType Leaf)) {
    throw "Installer did not copy the uninstaller."
  }
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
    throw "Installer did not call the VS Code extension installer."
  }

  & (Join-Path $installRoot "uninstall-harness-lens.ps1") `
    -InstallRoot $installRoot `
    -VsCodeCommand $fakeCodePath

  if (Test-Path -LiteralPath (Join-Path $installRoot "bin\harness-lens-lsp.exe")) {
    throw "Uninstaller did not remove the language server."
  }
  if (Test-Path -LiteralPath $statePath) {
    throw "Uninstaller did not remove the VS Code extension."
  }

  $calls = @(Get-Content -LiteralPath $logPath)
  if (-not ($calls -match '^--install-extension .+ --force$')) {
    throw "Expected VS Code install call was not recorded."
  }
  if (-not ($calls -contains "--uninstall-extension harness-lens.harness-lens")) {
    throw "Expected VS Code uninstall call was not recorded."
  }

  Write-Host "Windows install and uninstall fixture passed."
} finally {
  Remove-Item Env:HARNESS_LENS_TEST_LOG -ErrorAction SilentlyContinue
  Remove-Item Env:HARNESS_LENS_TEST_STATE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
