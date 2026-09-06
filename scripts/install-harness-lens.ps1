# SPDX-License-Identifier: MPL-2.0
# Copyright © 2026 Cristian Camargo Filho

[CmdletBinding()]
param(
  [string]$Version = "latest",
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "HarnessLens"),
  [string]$VsCodeCommand = "code",
  [string]$VsixPath,
  [string]$LanguageServerPath,
  [string]$UninstallerPath,
  [string]$ChecksumPath
)

$ErrorActionPreference = "Stop"
$extensionId = "harness-lens.harness-lens"
$repository = "harness-lens/harness-lens-vscode"
$vsixAsset = "harness-lens.vsix"
$serverAsset = "harness-lens-lsp-windows-x64.zip"
$uninstallerAsset = "uninstall-harness-lens.ps1"
$checksumAsset = "SHA256SUMS"

function Get-ExpectedHash {
  param(
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$FileName
  )

  $expectedHashes = @()
  foreach ($line in Get-Content -LiteralPath $ManifestPath) {
    if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+)$' -and $Matches[2] -eq $FileName) {
      $expectedHashes += $Matches[1].ToUpperInvariant()
    }
  }
  if ($expectedHashes.Count -ne 1) {
    throw "Expected one checksum entry for $FileName in $ManifestPath."
  }
  return $expectedHashes[0]
}

function Assert-Hash {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ManifestPath
  )

  $fileName = Split-Path -Leaf $Path
  $expected = Get-ExpectedHash -ManifestPath $ManifestPath -FileName $fileName
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if ($actual -ne $expected) {
    throw "SHA-256 verification failed for $fileName."
  }
}

function Invoke-VsCode {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  & $VsCodeCommand @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "VS Code command failed with exit code $LASTEXITCODE."
  }
}

if (-not $env:LOCALAPPDATA -and -not $PSBoundParameters.ContainsKey("InstallRoot")) {
  throw "LOCALAPPDATA is unavailable. Pass -InstallRoot explicitly."
}
if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  throw "InstallRoot cannot be empty."
}
if ([bool]$VsixPath -ne [bool]$LanguageServerPath) {
  throw "Pass both -VsixPath and -LanguageServerPath for a local installation."
}

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("harness-lens-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
  $localInstall = [bool]$VsixPath
  if ($localInstall) {
    $resolvedVsix = (Resolve-Path -LiteralPath $VsixPath).Path
    $resolvedServer = (Resolve-Path -LiteralPath $LanguageServerPath).Path
    if (-not $UninstallerPath) {
      $UninstallerPath = Join-Path $PSScriptRoot $uninstallerAsset
    }
    $resolvedUninstaller = (Resolve-Path -LiteralPath $UninstallerPath).Path
    $resolvedChecksum = if ($ChecksumPath) { (Resolve-Path -LiteralPath $ChecksumPath).Path } else { $null }

    if ($resolvedChecksum) {
      Assert-Hash -Path $resolvedVsix -ManifestPath $resolvedChecksum
      Assert-Hash -Path $resolvedServer -ManifestPath $resolvedChecksum
      Assert-Hash -Path $resolvedUninstaller -ManifestPath $resolvedChecksum
    }
  } else {
    $releaseBase = if ($Version -eq "latest") {
      "https://github.com/$repository/releases/latest/download"
    } else {
      "https://github.com/$repository/releases/download/$Version"
    }

    $resolvedVsix = Join-Path $temporaryRoot $vsixAsset
    $serverArchive = Join-Path $temporaryRoot $serverAsset
    $resolvedUninstaller = Join-Path $temporaryRoot $uninstallerAsset
    $resolvedChecksum = Join-Path $temporaryRoot $checksumAsset

    Invoke-WebRequest -UseBasicParsing -Uri "$releaseBase/$checksumAsset" -OutFile $resolvedChecksum
    if ($PSCommandPath) {
      $expectedInstallerHash = Get-ExpectedHash -ManifestPath $resolvedChecksum -FileName "install-harness-lens.ps1"
      $actualInstallerHash = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash
      if ($actualInstallerHash -ne $expectedInstallerHash) {
        throw "SHA-256 verification failed for install-harness-lens.ps1."
      }
    }
    Invoke-WebRequest -UseBasicParsing -Uri "$releaseBase/$vsixAsset" -OutFile $resolvedVsix
    Invoke-WebRequest -UseBasicParsing -Uri "$releaseBase/$serverAsset" -OutFile $serverArchive
    Invoke-WebRequest -UseBasicParsing -Uri "$releaseBase/$uninstallerAsset" -OutFile $resolvedUninstaller

    Assert-Hash -Path $resolvedVsix -ManifestPath $resolvedChecksum
    Assert-Hash -Path $serverArchive -ManifestPath $resolvedChecksum
    Assert-Hash -Path $resolvedUninstaller -ManifestPath $resolvedChecksum

    $expandedServer = Join-Path $temporaryRoot "language-server"
    Expand-Archive -LiteralPath $serverArchive -DestinationPath $expandedServer
    $serverMatches = @(Get-ChildItem -LiteralPath $expandedServer -Filter "harness-lens-lsp.exe" -File -Recurse)
    if ($serverMatches.Count -ne 1) {
      throw "The language-server archive must contain exactly one harness-lens-lsp.exe."
    }
    $resolvedServer = $serverMatches[0].FullName
  }

  Get-Process "harness-lens-lsp" -ErrorAction SilentlyContinue | Stop-Process -Force

  $binRoot = Join-Path $InstallRoot "bin"
  New-Item -ItemType Directory -Path $binRoot -Force | Out-Null
  $installedServer = Join-Path $binRoot "harness-lens-lsp.exe"
  $installedUninstaller = Join-Path $InstallRoot $uninstallerAsset
  Copy-Item -LiteralPath $resolvedServer -Destination $installedServer -Force
  Copy-Item -LiteralPath $resolvedUninstaller -Destination $installedUninstaller -Force

  Invoke-VsCode -Arguments @("--install-extension", $resolvedVsix, "--force")

  $receipt = [ordered]@{
    extensionId = $extensionId
    installedAt = [DateTime]::UtcNow.ToString("o")
    version = $Version
  }
  $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallRoot "install.json") -Encoding UTF8

  Write-Host "Harness Lens was installed for VS Code."
  Write-Host "Language server: $installedServer"
  Write-Host "Uninstall: powershell -ExecutionPolicy Bypass -File `"$installedUninstaller`""
} finally {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
