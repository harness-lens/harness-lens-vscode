<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright © 2026 Cristian Camargo Filho -->

# Manual installation

This guide installs the preview VS Code client and the native language server
on Windows. The same commands work in a repository cloned under WSL by using
`/mnt/d/...` paths from a WSL shell instead of PowerShell.

## Prerequisites

- VS Code
- Git
- Rust stable (the repositories currently require Rust 1.85 or newer)
- Node.js 22 and npm 11 when building the VS Code client from source

## Install the language server

Close VS Code, or stop the running server before replacing its executable:

```powershell
cd D:\git\repos\language-server
git pull --ff-only origin main

Get-Process harness-lens-lsp -ErrorAction SilentlyContinue |
  Stop-Process -Force

$installRoot = Join-Path $env:USERPROFILE ".harness-lens"

cargo install --locked --force `
  --path .\rust `
  --root $installRoot
```

The executable is installed at
`$env:USERPROFILE\.harness-lens\bin\harness-lens-lsp.exe`. Installing into a
private root avoids collisions with a server still held open by an editor.

To make both Harness Lens commands available in new terminals:

```powershell
$binPath = "$env:USERPROFILE\.harness-lens\bin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binPath*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$binPath", "User")
}
$env:Path = "$binPath;$env:Path"

harness-lens-lsp --help
```

## Install the VS Code client from source

```powershell
cd D:\git\repos\harness-lens-vscode
npm ci
npm run package:extension
code --install-extension .\artifacts\harness-lens.vsix --force
```

If the extension is available in the VS Code Marketplace, install it from the
Extensions view instead; the language server executable is still configured
separately unless a future bundle includes it.

## Configure VS Code

Open `Preferences: Open User Settings (JSON)` and add this property inside the
existing JSON object:

```json
{
  "harnessLens.languageServer.path": "C:\\Users\\crist\\.harness-lens\\bin\\harness-lens-lsp.exe"
}
```

Replace `crist` with the Windows account name shown by `$env:USERNAME`.

Then run `Developer: Reload Window`, trust the workspace, and run
`Harness Lens: Restart Language Server`.

## Verify the installation

Open an `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, or supported rules/configuration
file. Harness Lens diagnostics appear in the editor and in `View: Problems`
(`Ctrl+Shift+M`). Run `Harness Lens: Scan Workspace` to see every discovered
asset.

## Run the CLI

The CLI is installed from the CLI repository with the same private root:

```powershell
cd D:\git\repos\cli
git pull --ff-only origin main

$installRoot = Join-Path $env:USERPROFILE ".harness-lens"
cargo install --locked --force --path .\rust --root $installRoot

& "$installRoot\bin\harness-lens.exe" D:\git\repos\your-project
& "$installRoot\bin\harness-lens.exe" D:\git\repos\your-project --json
```

PowerShell paths such as `D:\git\repos` are not interchangeable with WSL
paths such as `/mnt/d/git/repos`; use the path syntax of the shell running the
command.
