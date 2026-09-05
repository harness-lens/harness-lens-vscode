> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# Harness Lens for VS Code

Sibling repository for HarnessLens editor integration and reusable VS Code-facing discovery package.

> **Status:** early preview. The Marketplace extension provides discovery,
> navigation, and a client for the external Rust language server.

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

The npm package discovers supported agent harness files from Node.js. The VS Code
extension adds **Harness Lens: Scan Workspace**, displays discovered file count,
opens selected harness files, and starts `harness-lens-lsp` when a harness file
is present. Standard diagnostics are compatible with VS Code's Problems view and
extensions such as Error Lens.

Install the server from a checkout of the
[`language-server`](https://github.com/harness-lens/language-server) repository:

```bash
cargo install --path rust
```

If it is not on `PATH`, set `harnessLens.languageServer.path` to its absolute
location. Server execution is disabled in untrusted and virtual workspaces.

## Ecosystem

- [Core](https://github.com/harness-lens/core)
- [SDK](https://github.com/harness-lens/sdk)
- [CLI](https://github.com/harness-lens/cli)
- [Language Server](https://github.com/harness-lens/language-server)
- [Project hub](https://github.com/harness-lens/harness-lens)

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

See the [manual installation guide](docs/manual-installation.md) for Windows,
WSL, native language-server, VSIX, and CLI setup.

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
