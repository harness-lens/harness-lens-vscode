<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright © 2026 Cristian Camargo Filho -->

# Windows installation and configuration

The official Windows installer downloads the matching VSIX and native
`harness-lens-lsp.exe` from one GitHub release, verifies their SHA-256 hashes,
installs the extension, and places the server under
`%LOCALAPPDATA%\HarnessLens\bin`. Harness Lens discovers that server location
automatically.

## Install or update

Open Windows PowerShell and run:

```powershell
$installer = Join-Path $env:TEMP "install-harness-lens.ps1"
Invoke-WebRequest "https://github.com/harness-lens/harness-lens-vscode/releases/latest/download/install-harness-lens.ps1" -OutFile $installer
powershell -ExecutionPolicy Bypass -File $installer
```

Close and reopen VS Code after installation. To install a specific release,
download the installer from that tag and pass the same value:

```powershell
$version = "v0.0.3"
Invoke-WebRequest "https://github.com/harness-lens/harness-lens-vscode/releases/download/$version/install-harness-lens.ps1" -OutFile $installer
powershell -ExecutionPolicy Bypass -File $installer -Version $version
```

The installer needs the `code` command. A normal Windows VS Code installation
adds it to `PATH`; restart PowerShell after installing VS Code. You can also
pass another compatible command with `-VsCodeCommand`, such as `code-insiders`
or the full path to `code.cmd`.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\HarnessLens\uninstall-harness-lens.ps1"
```

The uninstaller removes the Harness Lens extension and the native server files
installed under `%LOCALAPPDATA%\HarnessLens`. It preserves all VS Code user and
workspace settings.

## Basic configuration

The coordinated installation needs no path setting. These defaults are active:

```json
{
  "harnessLens.languageServer.enabled": true,
  "harnessLens.languageServer.path": "",
  "harnessLens.report.maxFiles": 5000,
  "harnessLens.runtime.mode": "off",
  "harnessLens.providers.codeburn.enabled": false
}
```

An empty language-server path selects the coordinated Windows location first
and then `PATH`. Set an absolute path only when using a custom server build.

Runtime evidence is optional. Run **Harness Lens: Enable CodeBurn Provider** to
review the execution boundary before selecting `live` or `snapshot` under
`harnessLens.runtime.mode`. CodeBurn remains a separate installation; Harness
Lens never downloads it.

Other useful settings are:

- `harnessLens.languageServer.arguments`: extra server arguments.
- `harnessLens.runtime.executable`: CodeBurn command used in `live` mode.
- `harnessLens.runtime.period`: validated aggregate period used in `live` mode.
- `harnessLens.runtime.snapshotPath`: aggregate JSON file used in `snapshot`
  mode.

Run **Harness Lens: Restart Language Server** after changing the server path or
arguments. Run **Harness Lens: Refresh Workspace Report** after changing report
or runtime settings.

## Verify

Trust and open a filesystem workspace containing `AGENTS.md`, `CLAUDE.md`,
`SKILL.md`, or another supported harness file. The Workspace Observer should
list the file, and diagnostics should appear in **View: Problems**. You can also
check the installed server in PowerShell:

```powershell
Get-Item "$env:LOCALAPPDATA\HarnessLens\bin\harness-lens-lsp.exe"
Get-Process harness-lens-lsp -ErrorAction SilentlyContinue | Select-Object Id, Path
```

## Install local build artifacts

Repository contributors can test a locally packaged VSIX and server without a
GitHub release:

```powershell
.\scripts\install-harness-lens.ps1 `
  -VsixPath .\artifacts\harness-lens.vsix `
  -LanguageServerPath D:\path\to\harness-lens-lsp.exe
```

See the [manual source-build guide](manual-installation.md) for Rust, npm, CLI,
and WSL development instructions.
