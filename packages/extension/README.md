> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# Harness Lens

> **Early preview**
>
> This release discovers supported coding-agent harness files and connects to
> the external `harness-lens-lsp` reference server. Do not rely on this preview
> as a policy or compliance gate.

Harness Lens is an early VS Code integration for coding-agent instruction files.

## Available today

- Discover supported harness files in the current workspace.
- Show the detected file count in the status bar.
- Select a discovered file from a quick picker and open it in the editor.
- Publish deterministic repetition and heuristic incongruence diagnostics from
  the Rust language server.
- Interoperate with the Problems view and Error Lens through standard LSP
  diagnostics.

## Not available yet

- Code actions or automatic fixes.
- Metrics, historical comparisons, or effectiveness analysis.

## Language server

Install `harness-lens-lsp` from the
[language-server repository](https://github.com/harness-lens/language-server),
or set `harnessLens.languageServer.path` to an existing binary. The extension
starts it only for trusted, filesystem-backed workspaces containing harness
files. Use **Harness Lens: Restart Language Server** after changing the binary.

## Use the preview

Run **Harness Lens: Scan Workspace** from the Command Palette. Select any result to open it. The status bar shows the current detected file count.

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

Feedback and bug reports are welcome in the [Harness Lens VS Code repository](https://github.com/harness-lens/harness-lens-vscode/issues).

## License

Early namespace-reservation versions used BSD-3-Clause. The official extension
implementation is licensed under MPL-2.0. See [LICENSE](LICENSE) and the
repository's [licensing policy](../../LICENSING.md).
