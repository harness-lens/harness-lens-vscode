> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# Harness Lens for VS Code

Sibling repository for HarnessLens editor integration and reusable VS Code-facing discovery package.

> **Status:** early preview. The Marketplace extension currently provides file
> discovery and navigation only. It does not yet provide validation,
> diagnostics, metrics, or language-server features.

## Published identities

- GitHub repository: `harness-lens/harness-lens-vscode`
- npm package: `@harness-lens/vscode`
- Marketplace extension name: `harness-lens`
- Canonical VS Code extension ID: `harness-lens.harness-lens`
- Display name: `Harness Lens`
- Marketplace publisher: `harness-lens`
- Marketplace lifecycle: `0.0.1` unpublished; `0.0.2` prepared as Preview

VS Code forms the canonical extension ID as `<publisher>.<name>`. The unscoped Marketplace manifest and scoped npm package therefore use separate manifests in this repository.

## Structure

```text
harness-lens-vscode/
├── packages/
│   ├── extension/   # Marketplace extension: harness-lens.harness-lens
│   └── vscode/      # npm package: @harness-lens/vscode
├── docs/
├── scripts/
└── .github/
```

## Current behavior

The npm package discovers supported agent harness files from Node.js. The VS Code extension adds **Harness Lens: Scan Workspace**, displays discovered file count in the status bar, and opens selected harness files.

Supported files:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.github/copilot-instructions.md`
- files under `.cursor/rules/`

## Development

```bash
npm ci
npm run check
npm test
npm run package
```

Artifacts are written to `artifacts/`:

- npm tarball for `@harness-lens/vscode`
- installable `harness-lens.vsix`

See [publishing setup](docs/publishing.md), [ecosystem plan](docs/ecosystem.md),
and the central [registry and administration map](https://github.com/harness-lens/harness-lens/blob/main/docs/registry-and-administration.md).

## License

Early namespace-reservation versions used BSD-3-Clause. The official functional
implementation is licensed under MPL-2.0. When Covered Software is distributed,
modified MPL-covered files must remain available in Source Code Form under the
license. See [LICENSING](LICENSING.md), [COPYRIGHT](COPYRIGHT), and
[TRADEMARKS](TRADEMARKS).
