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

## Select the latest source branches

Use these branches for the current preview source builds:

| Repository | Branch |
| --- | --- |
| Core | `feat/exact-duplicate-evaluation` |
| CLI | `build/sdk-agent-assets` |
| Language server | `build/sdk-agent-assets` |
| VS Code | `feat/agent-asset-discovery` |

In a checkout where the branch already exists, run `git switch BRANCH`; do not
repeat `git switch --track origin/BRANCH`. Use `--track` only on a fresh local
checkout. After switching, update it with:

```powershell
git fetch origin
git switch BRANCH
git pull --ff-only origin BRANCH
```

Replace `BRANCH` with the branch in the table.

## Install the language server

Close VS Code, or stop the running server before replacing its executable:

```powershell
cd D:\git\repos\language-server
git fetch origin
git switch build/sdk-agent-assets
git pull --ff-only origin build/sdk-agent-assets

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
git fetch origin
git switch feat/agent-asset-discovery
git pull --ff-only origin feat/agent-asset-discovery
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
git fetch origin
git switch build/sdk-agent-assets
git pull --ff-only origin build/sdk-agent-assets

$installRoot = Join-Path $env:USERPROFILE ".harness-lens"
cargo install --locked --force --path .\rust --root $installRoot

& "$installRoot\bin\harness-lens.exe" D:\git\repos\your-project
& "$installRoot\bin\harness-lens.exe" D:\git\repos\your-project --json
```

## Exercise the latest duplicate and cost rules

The new Core report fields are available immediately through the TypeScript
CLI by linking the Core checkout locally:

```powershell
cd D:\git\repos\core
npm ci
npm run build

cd D:\git\repos\cli
npm ci
npm link ..\core
npm run build
node .\dist\bin.js scan D:\git\repos\your-project `
  --input-cost-per-million-tokens 2.5 `
  --invocations 100 `
  --cost-reference provider/model-input-rate `
  --json
```

This reports `HL032` exact duplicates, source-size/token budgets, and input
cost per invocation/total. The native Rust CLI and language server use pinned
SDK revisions; they receive these new fields after the SDK revision is updated
to the Core PR and the binaries are reinstalled.

PowerShell paths such as `D:\git\repos` are not interchangeable with WSL
paths such as `/mnt/d/git/repos`; use the path syntax of the shell running the
command.
