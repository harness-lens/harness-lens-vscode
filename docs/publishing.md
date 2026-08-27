# Publishing

## Identity split

VS Code calculates extension identity from `publisher` and unscoped manifest `name`, producing `harness-lens.harness-lens`. npm requires the scoped package name `@harness-lens/vscode`. Separate manifests preserve both identities.

## First npm publish

npm trusted publishing can only be configured after a package exists. Perform version `0.0.1` interactively with an npm account that owns the `@harness-lens` scope and has 2FA enabled:

```bash
npm ci
npm run check
npm test
npm publish --workspace @harness-lens/vscode --access public
```

Then configure npm trusted publishing for `@harness-lens/vscode`:

- GitHub owner: `harness-lens`
- Repository: `harness-lens-vscode`
- Workflow: `release.yml`
- Environment: `npm`
- Allowed action: `npm publish`

Create the `npm` GitHub environment with required reviewers. Later GitHub releases publish through OIDC; no `NPM_TOKEN` secret is needed.

## Visual Studio Marketplace

1. Create Marketplace publisher ID `harness-lens`.
2. Run `npm run package:extension`.
3. Upload `artifacts/harness-lens.vsix` through Marketplace publisher management.

GitHub releases also attach the VSIX as a downloadable asset.

Azure DevOps global PATs retire on December 1, 2026. Do not build new PAT-based publishing automation. For future automated Marketplace publishing, configure Microsoft Entra workload identity federation and publish through Azure Pipelines with `vsce publish --azure-credential`.

## GitHub setup

1. Create repository `harness-lens/harness-lens-vscode` and push this local repository.
2. Create environments `npm` and `marketplace`; require reviewers.
3. Enable private vulnerability reporting and Dependabot alerts.
4. Protect `main`; require pull requests and CI/CodeQL checks.
5. Protect release tags such as `v*`.

Before each release, update both workspace versions. `npm run version:check` rejects mismatches and verifies the Git tag in CI.
