# HarnessLens ecosystem

HarnessLens should share one detection and validation model across every interface. UI targets should adapt shared results rather than reimplement rules.

## Intended package map

| Target | Package |
| --- | --- |
| Core library | `@harness-lens/core` |
| CLI | `@harness-lens/cli` |
| VS Code integration | `@harness-lens/vscode` |
| Public SDK | `@harness-lens/sdk` |
| Language server | `@harness-lens/language-server` |

Possible future monorepo:

```text
harness-lens/
├── packages/
│   ├── core/
│   ├── cli/
│   ├── vscode/
│   ├── sdk/
│   └── language-server/
└── apps/
    └── vscode-extension/
```

## Boundaries

- `core` owns discovery, parsing, deterministic validation, metrics, and result types.
- `cli` owns terminal input/output and automation-friendly exit codes.
- `vscode` owns editor adapters and reusable VS Code-facing APIs.
- `sdk` owns stable embedding APIs for other tools.
- `language-server` owns diagnostics, document symbols, code actions, and live workspace updates.
- Marketplace extension owns VS Code activation, commands, status bar, views, and packaging.

The current sibling repository prototypes `@harness-lens/vscode` and the Marketplace extension without forcing a premature migration of the Python package.
