> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

![Harness Lens](https://raw.githubusercontent.com/harness-lens/harness-lens-vscode/main/assets/harness-lens-banner.png)

# Harness Lens

> **Early preview**
>
> This release discovers supported coding-agent harness files and connects to
> the external `harness-lens-lsp` reference server. Do not rely on this preview
> as a policy or compliance gate.

Harness Lens is an early VS Code integration for coding-agent instruction files.

## Quick setup on Windows

Install the extension and its matching native language server together from an
official GitHub release:

```powershell
$installer = Join-Path $env:TEMP "install-harness-lens.ps1"
Invoke-WebRequest "https://github.com/harness-lens/harness-lens-vscode/releases/latest/download/install-harness-lens.ps1" -OutFile $installer
powershell -ExecutionPolicy Bypass -File $installer
```

See **[Windows install, uninstall, and extra configuration](https://github.com/harness-lens/harness-lens-vscode/blob/main/docs/windows-installation.md)**
for uninstall instructions, custom server paths, runtime modes, and contributor
installation. CodeBurn remains optional and separate.

![Harness Lens metrics overview](https://raw.githubusercontent.com/harness-lens/harness-lens-vscode/main/packages/extension/media/screenshots/metrics-overview.png)

## Available today

- Discover supported harness files in the current workspace.
- Show the detected file count in the status bar.
- Select a discovered file from a quick picker and open it in the editor.
- Publish deterministic repetition and heuristic incongruence diagnostics from
  the Rust language server.
- Interoperate with the Problems view and Error Lens through standard LSP
  diagnostics.
- Browse files, findings, cost, and coverage from the Harness Lens Activity Bar.
- Open a metrics center with per-file context/cost, score methods, plugin
  execution, and up to 100 local content-free history snapshots per workspace.
- Classify complete-report changes as improving, stable, degrading, or
  insufficient evidence using an explicit deterministic delta method.
- Show consent-controlled aggregate runtime status from newer language servers;
  provider selection and runtime mode both default to `off` for each VS Code
  window.
- Validate schema-versioned provider catalog and aggregate envelopes before
  using Native or optional-provider status.

## Not available yet

- Code actions or automatic fixes.
- Attributed per-file effectiveness.
- Tool-call error, retry, timeout, or cost history until the provider-neutral
  sanitized runtime trace contract is available.

Runtime evidence defaults to `off`, and CodeBurn remains separately disabled for
the VS Code window. Run **Harness Lens: Enable CodeBurn Provider** to review and
confirm its local execution boundary. Enabling does not install or launch
anything. Then choose
`live` to run a separately installed CodeBurn executable through language
server, or `snapshot` to read a canonical safe aggregate snapshot without
process launch. Configure mode, executable, period, snapshot path, and report
bound under `harnessLens.runtime.*` and `harnessLens.report.maxFiles`; disable
`harnessLens.providers.codeburn.enabled` to clear optional selection. CodeBurn
is optional, MIT-licensed, and not bundled. Extension never downloads, installs,
or updates it. Aggregate runtime evidence never changes deterministic findings
or scores.

## Language server

Install `harness-lens-lsp` from the
[language-server repository](https://github.com/harness-lens/language-server),
or set `harnessLens.languageServer.path` to an existing binary. The extension
starts it only for trusted, filesystem-backed workspaces containing harness
files. Use **Harness Lens: Restart Language Server** after changing the binary.
The metrics center requires a server supporting
`harnessLens/providerAggregate`, introduced by language-server
[PR #23](https://github.com/harness-lens/language-server/pull/23) and accepted in
immutable merge
[`496f288`](https://github.com/harness-lens/language-server/commit/496f28889b40522676c6d7a59a0b9b2d1af8e700).
Language server stays external rather than becoming bundled build dependency.
Older servers continue to provide standard diagnostics but cannot populate dashboard.

## Use the preview

Select the Harness Lens Activity Bar icon or run **Harness Lens: Open Metrics
Center**. Use **Harness Lens: Scan Workspace** for the quick picker. The status
bar shows the current detected file count.

Supported files:

- `AGENTS.md`
- `AGENTS.override.md`
- `CLAUDE.md` and `CLAUDE.local.md`
- `GEMINI.md`
- `SKILL.md`, including `.agents/skills/` and `.claude/skills/`
- GitHub Copilot instructions and `.github/agents/*.agent.md`
- Claude agents and rules under `.claude/`
- Codex config, agents, and rules under `.codex/`
- compatible rules under `.agents/rules/` and `.cursor/rules/`

See the [product tour](https://github.com/harness-lens/harness-lens-vscode/blob/main/docs/product-tour.md)
for the Workspace Observer, scores, runtime, plugins, and local history. The
repository's [manual installation guide](https://github.com/harness-lens/harness-lens-vscode/blob/main/docs/manual-installation.md)
covers source builds, WSL, native language-server, VSIX, and CLI setup.

Feedback and bug reports are welcome in the [Harness Lens VS Code repository](https://github.com/harness-lens/harness-lens-vscode/issues).

## License

Early namespace-reservation versions used BSD-3-Clause. The official extension
implementation is licensed under MPL-2.0. See [LICENSE](LICENSE) and the
repository's [licensing policy](https://github.com/harness-lens/harness-lens-vscode/blob/main/LICENSING.md).
