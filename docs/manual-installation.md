<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright © 2026 Cristian Camargo Filho -->

# Manual installation

This guide installs the preview VS Code client and native language server on
Windows using PowerShell. WSL needs Linux binaries and a VS Code WSL extension
host; replacing drive letters with `/mnt/d` does not translate these commands.

## Prerequisites

- VS Code
- Git
- Rust stable and the Windows C++ build tools
- Node.js 22 and npm 11 when building the VS Code client from source

## Select the latest source branches

Use these branches for the current preview source builds:

| Repository | Branch |
| --- | --- |
| Core | `feat/exact-duplicate-evaluation` |
| CLI | `build/sdk-agent-assets` |
| Language server | `build/sdk-agent-assets` |
| VS Code | `main` (packaging fixes are merged) |

In a checkout where the branch already exists, run `git switch BRANCH`; do not
repeat `git switch --track origin/BRANCH`. Use `--track` only on a fresh local
checkout. After switching, update it with:

```powershell
git fetch origin
git switch BRANCH
git pull --ff-only
```

Replace `BRANCH` with the branch in the table.
Do not run `git pull --ff-only origin main` while remaining on a feature branch;
switch to `main` first if that is the branch you intend to update.

If `git pull --ff-only` reports divergence, stop: rebuilding at that point
uses the old local revision. Use fresh checkouts for installation to preserve
existing commits and uncommitted files. Run the rest of this guide in the same
PowerShell session, starting with:

```powershell
$buildRoot = Join-Path ([IO.Path]::GetTempPath()) ("harness-lens-build-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $buildRoot | Out-Null
$projectPath = "D:\git\repos\cli"
if (-not (Test-Path -LiteralPath $projectPath -PathType Container)) {
  throw "Set projectPath to an existing project directory."
}
git clone --branch build/sdk-agent-assets https://github.com/harness-lens/language-server.git "$buildRoot\language-server"
if ($LASTEXITCODE -ne 0) { throw "Language server checkout failed" }
git clone --branch build/sdk-agent-assets https://github.com/harness-lens/cli.git "$buildRoot\cli"
if ($LASTEXITCODE -ne 0) { throw "CLI checkout failed" }
git clone --branch feat/exact-duplicate-evaluation https://github.com/harness-lens/core.git "$buildRoot\core"
if ($LASTEXITCODE -ne 0) { throw "Core checkout failed" }
git clone --branch main https://github.com/harness-lens/harness-lens-vscode.git "$buildRoot\harness-lens-vscode"
if ($LASTEXITCODE -ne 0) { throw "VS Code checkout failed" }
```

Change `$projectPath` to scan a different existing project. Record
`git rev-parse HEAD` in each checkout to identify the exact revision built;
version numbers alone do not identify preview commits.

## Install the language server

Close VS Code, or stop the running server before replacing its executable:

```powershell
Set-Location "$buildRoot\language-server"

Get-Process harness-lens-lsp -ErrorAction SilentlyContinue |
  Stop-Process -Force

$installRoot = Join-Path $env:USERPROFILE ".harness-lens"

cargo install --locked --force `
  --path .\rust `
  --root $installRoot
if ($LASTEXITCODE -ne 0) { throw "Language server installation failed" }
```

The executable is installed at
`$env:USERPROFILE\.harness-lens\bin\harness-lens-lsp.exe`. Installing into a
private root makes its path explicit; stop the server before replacing it.

To make both Harness Lens commands available in new terminals:

```powershell
$binPath = "$env:USERPROFILE\.harness-lens\bin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binPath*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$binPath", "User")
}
$env:Path = "$binPath;$env:Path"

Get-Item "$installRoot\bin\harness-lens-lsp.exe"
```

The server currently does not implement `--help`: it waits for LSP messages
on standard input. Interactive terminal text can produce JSON-RPC error
`-32700` (Parse error). Press Ctrl+C if it is still running and let VS Code
start it. `Get-Item` checks executable presence; editor diagnostics verify
the connection. The absolute paths below work without adding binaries to PATH.

## Install the VS Code client from source

```powershell
Set-Location "$buildRoot\harness-lens-vscode"
npm ci
if ($LASTEXITCODE -ne 0) { throw "Extension dependency installation failed" }
npm run package:extension
if ($LASTEXITCODE -ne 0) { throw "Extension packaging failed" }
code --install-extension .\artifacts\harness-lens.vsix --force
if ($LASTEXITCODE -ne 0) { throw "VSIX installation failed" }
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
Set-Location "$buildRoot\cli"

$installRoot = Join-Path $env:USERPROFILE ".harness-lens"
cargo install --locked --force --path .\rust --root $installRoot
if ($LASTEXITCODE -ne 0) { throw "CLI installation failed" }

& "$installRoot\bin\harness-lens.exe" $projectPath
& "$installRoot\bin\harness-lens.exe" $projectPath --json
```

## Exercise the latest duplicate and cost rules

The new Core report fields are available immediately through the TypeScript
CLI by linking the Core checkout locally:

```powershell
Set-Location "$buildRoot\core"
npm ci
if ($LASTEXITCODE -ne 0) { throw "Core dependency installation failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Core build failed" }

Set-Location "$buildRoot\cli"
npm ci
if ($LASTEXITCODE -ne 0) { throw "CLI dependency installation failed" }
npm link ..\core
if ($LASTEXITCODE -ne 0) { throw "Core link failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "CLI build failed; do not run dist output" }
node .\dist\bin.js scan $projectPath `
  --input-cost-per-million-tokens 2.5 `
  --invocations 100 `
  --cost-reference example-input-rate `
  --json
```

This reports `HL032` exact duplicates, source-size/token budgets, and input
cost per invocation/total. The native Rust CLI and language server use pinned
SDK revisions; they receive these new fields after the Core → SDK → CLI/LSP
pins are updated and the binaries are reinstalled. Linking npm Core does not
change the Rust binaries or editor diagnostics.

The price 2.5 per million input tokens and 100 invocations are example inputs,
not a quoted provider rate or measured usage. Tokens use a character-count
heuristic. Run `npm link` after `npm ci`, because `npm ci` replaces the dependency
directory. If a build fails, stop before running `dist` output. `ENOENT` for
a scan directory means that directory does not exist; validate `$projectPath`
first as shown above.

PowerShell paths such as `D:\git\repos` are not interchangeable with WSL
paths such as `/mnt/d/git/repos`; use the path syntax of the shell running the
command.
