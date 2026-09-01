> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# Publishing

## Administration panels

- Marketplace publisher: <https://marketplace.visualstudio.com/manage/publishers/harness-lens>
- Public extension page: <https://marketplace.visualstudio.com/items?itemName=harness-lens.harness-lens>
- npm organization packages: <https://www.npmjs.com/settings/harness-lens/packages>
- Public npm package: <https://www.npmjs.com/package/@harness-lens/vscode>
- GitHub repository settings: <https://github.com/harness-lens/harness-lens-vscode/settings>
- GitHub environments: <https://github.com/harness-lens/harness-lens-vscode/settings/environments>
- GitHub Actions: <https://github.com/harness-lens/harness-lens-vscode/actions>
- GitHub releases: <https://github.com/harness-lens/harness-lens-vscode/releases>

These management links require the corresponding publisher, organization, or
repository role. Never place Marketplace credentials, npm tokens, GitHub App
private keys, or webhook secrets in this repository.

## Identity split

VS Code calculates extension identity from `publisher` and unscoped manifest `name`, producing `harness-lens.harness-lens`. npm requires the scoped package name `@harness-lens/vscode`. Separate manifests preserve both identities.

## npm publishing

`@harness-lens/vscode` version `0.0.1` established the npm package. Configure
and retain npm trusted publishing with:

- GitHub owner: `harness-lens`
- Repository: `harness-lens-vscode`
- Workflow: `release.yml`
- Environment: `npm`
- Allowed action: `npm publish`

Create the `npm` GitHub environment with required reviewers. GitHub releases
publish through OIDC; no `NPM_TOKEN` secret is needed.

## Visual Studio Marketplace

The publisher ID is `harness-lens`, and the extension ID is
`harness-lens.harness-lens`.

Current lifecycle:

- `0.0.1` established the extension record and is unpublished.
- `0.0.2` is the first package explicitly marked as a Marketplace Preview.

To prepare a Marketplace update:

1. Update every workspace version and the changelog.
2. Keep `preview: true` until the implemented feature set is production-ready.
3. Run `npm ci`, `npm run check`, `npm test`, and `npm run package:extension`.
4. Inspect the VSIX identity, file list, and bundled content.
5. Install the VSIX locally and exercise **Harness Lens: Scan Workspace**.
6. Upload `artifacts/harness-lens.vsix` from the publisher management panel.
7. Verify the public Marketplace entry and install it by extension ID.

If a published version is not ready for downloads, use **More Actions >
Unpublish**. Do not use **Remove**: Marketplace removal is irreversible, and
the extension name cannot be reused even by the original publisher. An
unpublished extension remains recorded and API-discoverable, but it cannot be
downloaded from Marketplace or VS Code.

GitHub releases also attach the VSIX as a downloadable asset.

Azure DevOps global PATs retire on December 1, 2026. Do not build new PAT-based publishing automation. For future automated Marketplace publishing, configure Microsoft Entra workload identity federation and publish through Azure Pipelines with `vsce publish --azure-credential`.

## GitHub setup

1. Create repository `harness-lens/harness-lens-vscode` and push this local repository.
2. Create environments `npm` and `marketplace`; require reviewers.
3. Enable private vulnerability reporting and Dependabot alerts.
4. Protect `main`; require pull requests and CI/CodeQL checks.
5. Protect release tags such as `v*`.

Before each release, update both workspace versions. `npm run version:check` rejects mismatches and verifies the Git tag in CI.
