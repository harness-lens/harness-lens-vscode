> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# How to contribute

Read the central [ecosystem contribution flow](https://github.com/harness-lens/harness-lens/blob/main/docs/architecture.md#how-to-contribute),
[architecture rules](https://github.com/harness-lens/harness-lens/blob/main/docs/architecture.md#architecture-rules),
and [CI/test map](https://github.com/harness-lens/harness-lens/blob/main/docs/architecture.md#ci-and-test-map).
VS Code owns editor lifecycle, settings, views, navigation, and VSIX/npm
packaging. It consumes language-server diagnostics and must not copy Core rules.
See the [ecosystem boundary](docs/ecosystem.md) and
[publishing guide](docs/publishing.md).

Create a focused branch, add tests for behavior changes, and open a pull request against `main`.

```bash
npm ci
npm run check
npm test
npm run package
```

## Licensing contributions

Contributions intentionally submitted to this repository are provided under
MPL-2.0. You must have the necessary rights to submit the work. When Covered
Software is distributed, modifications to MPL-covered files remain subject to
the Source Code Form obligations in the license.
