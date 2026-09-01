> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# Harness Lens

> **Early preview**
>
> This release only discovers and opens supported coding-agent harness files.
> Validation, diagnostics, metrics, and language-server integration are not
> available yet. Do not rely on this preview as a policy or compliance gate.

Harness Lens is an early VS Code integration for coding-agent instruction files.

## Available today

- Discover supported harness files in the current workspace.
- Show the detected file count in the status bar.
- Select a discovered file from a quick picker and open it in the editor.

## Not available yet

- Instruction validation or policy findings.
- Editor diagnostics, code actions, or automatic fixes.
- Metrics, historical comparisons, or effectiveness analysis.
- Live language-server integration.

## Use the preview

Run **Harness Lens: Scan Workspace** from the Command Palette. Select any result to open it. The status bar shows the current detected file count.

Supported files:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.github/copilot-instructions.md`
- files under `.cursor/rules/`

Feedback and bug reports are welcome in the [Harness Lens VS Code repository](https://github.com/harness-lens/harness-lens-vscode/issues).

## License

Early namespace-reservation versions used BSD-3-Clause. The official extension
implementation is licensed under MPL-2.0. See [LICENSE](LICENSE) and the
repository's [licensing policy](../../LICENSING.md).
