> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# Harness Lens

Harness Lens discovers coding-agent harness files in the current VS Code workspace.

Run **Harness Lens: Scan Workspace** from the Command Palette. Select any result to open it. The status bar shows the current detected file count.

Supported files:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.github/copilot-instructions.md`
- files under `.cursor/rules/`

This is a pre-alpha discovery preview. Validation findings, metrics, diagnostics, and live language-server support are planned.

## License

Early namespace-reservation versions used BSD-3-Clause. The official extension
implementation is licensed under MPL-2.0. See [LICENSE](LICENSE) and the
repository's [licensing policy](../../LICENSING.md).
