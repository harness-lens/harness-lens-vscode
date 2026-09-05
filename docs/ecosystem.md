> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# HarnessLens ecosystem

HarnessLens should share one detection and validation model across every interface. UI targets should adapt shared results rather than reimplement rules.

## Repository map

| Target | Repository |
| --- | --- |
| Core library | [`harness-lens/core`](https://github.com/harness-lens/core) |
| SDK and adapters | [`harness-lens/sdk`](https://github.com/harness-lens/sdk) |
| CLI | [`harness-lens/cli`](https://github.com/harness-lens/cli) |
| Language server | [`harness-lens/language-server`](https://github.com/harness-lens/language-server) |
| VS Code integration | [`harness-lens/harness-lens-vscode`](https://github.com/harness-lens/harness-lens-vscode) |

The umbrella repository pins compatible revisions without absorbing ownership:

```text
harness-lens/modules/
├── core/                 # Git submodule
├── sdk/                  # Git submodule
├── cli/                  # Git submodule
├── language-server/      # Git submodule
└── harness-lens-vscode/  # Git submodule
```

## Boundaries

- `core` owns domain contracts, deterministic validation, statistical helpers,
  metrics, and result types.
- `cli` owns terminal input/output and automation-friendly exit codes.
- `vscode` owns editor adapters and reusable VS Code-facing APIs.
- `sdk` owns filesystem discovery, configuration, integrations, and stable
  embedding APIs for other tools.
- `language-server` owns diagnostics, document symbols, code actions, and live workspace updates.
- Marketplace extension owns VS Code activation, commands, status bar, views, and packaging.

The extension launches the language-server binary through standard I/O. The LSP
publishes ordinary diagnostics, so Error Lens interoperability requires no
private API or direct dependency.
