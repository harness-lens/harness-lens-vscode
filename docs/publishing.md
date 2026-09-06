> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# Publishing

## Administration panels

- Marketplace publisher: <https://marketplace.visualstudio.com/manage/publishers/harness-lens>
- Public extension page: <https://marketplace.visualstudio.com/items?itemName=harness-lens.harness-lens>
- Open VSX extension page: <https://open-vsx.org/extension/harness-lens/harness-lens>
- Open VSX namespace settings: <https://open-vsx.org/user-settings/namespaces>
- Open VSX trusted publishers: <https://open-vsx.org/user-settings/trusted-publishers>
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
6. Publish a GitHub release and approve the protected `marketplace` environment.
7. Verify the public Marketplace entry and install it by extension ID.

The release workflow publishes the exact `harness-lens.vsix` produced by the
package job. It downloads the combined release artifact, verifies every entry
in `SHA256SUMS`, prints the VSIX checksum in the job log, and passes that file to
`vsce publish --packagePath`. The Marketplace job contains no build or package
command.

Configure the current stable publishing path as follows:

1. In Azure DevOps, create a short-lived token accepted by the Marketplace with
   **All accessible organizations** selected and only the `Marketplace
   (Manage)` scope, then confirm that identity has access to the publisher.
2. Create a GitHub environment named `marketplace`, add required reviewers, and
   store the token as environment secret `VSCE_PAT`.
3. Create repository variable `VS_MARKETPLACE_PUBLISH_ENABLED=true` only after
   the publisher identity and protected environment are ready.
4. Publish a GitHub release from a protected version tag. Approval of the
   `marketplace` environment is the final publication gate.

These steps follow the current stable
[VS Code CI publishing guide](https://code.visualstudio.com/api/working-with-extensions/continuous-integration#github-actions-automated-publishing).
Do not print the token or pass it on the command line.

If a published version is not ready for downloads, use **More Actions >
Unpublish**. Do not use **Remove**: Marketplace removal is irreversible, and
the extension name cannot be reused even by the original publisher. An
unpublished extension remains recorded and API-discoverable, but it cannot be
downloaded from Marketplace or VS Code.

GitHub releases also attach the VSIX, checksum-verified Windows install and
uninstall scripts, and a matching native Windows language-server archive. The
server build is pinned to the immutable source SHA in `release.yml`; update that
pin only after the owning language-server change is merged and verified.

## Open VSX

Open VSX receives the exact reviewed `artifacts/harness-lens.vsix`; do not
rebuild or modify a registry-specific copy. The release workflow publishes only
when repository variable `OPEN_VSX_PUBLISH_ENABLED` is `true`.

Before enabling publication:

1. Sign the Open VSX publisher agreement and create the `harness-lens`
   namespace.
2. Claim namespace ownership and add a second owner for continuity.
3. Protect the `open-vsx` GitHub environment with required reviewers. Store a
   dedicated, least-privilege token as environment secret `OVSX_PAT`.
4. Set `OPEN_VSX_PUBLISH_ENABLED=true` only after namespace, token, and
   environment protections are verified.

Confirm Open VSX and Visual Studio Marketplace show the same extension ID,
version, README, changelog, and package checksum for each release.

## Checksums, SBOMs, and provenance

Release workflow attaches VSIX, npm tarball, Windows language-server archive,
install and uninstall scripts, CycloneDX JSON SBOMs, and `SHA256SUMS`. It
creates separate GitHub build provenance for npm, VSIX, and the native server,
plus SBOM attestations for the npm and VSIX packages. Consumers can verify
provenance with:

```bash
gh attestation verify harness-lens.vsix --repo harness-lens/harness-lens-vscode
```

All registry jobs verify the complete downloaded `SHA256SUMS` before
publishing. npm receives the reviewed tarball from the packaging job; Open VSX
and Visual Studio Marketplace receive the reviewed VSIX. None of the registry
jobs repackages those artifacts. The checksum identifies the uploaded VSIX and
GitHub release asset; a registry may apply its own server-side signing or
delivery processing.

For local verification, run `npm run package` and `npm run sbom`. The SBOM
command uses `--output-reproducible`; repeated generation from the same
dependency tree must produce identical bytes. Then write and verify checksums:

```bash
cd artifacts
sha256sum *.tgz *.vsix *.cdx.json > SHA256SUMS
sha256sum --check SHA256SUMS
```

Local checksums do not provide GitHub attestations. Those are generated only
by the release workflow for its own build artifacts.

If a package changes, increment SemVer and issue a new release; never replace an
asset while retaining old checksum or attestation.

Azure DevOps global PATs retire on December 1, 2026. Keep this PAT route
short-lived and migrate when a stable `@vscode/vsce` release supports direct
Marketplace trusted publishing from GitHub Actions. Do not adopt a prerelease
publisher CLI in the release workflow merely to enable that migration early.

## GitHub setup

1. Create repository `harness-lens/harness-lens-vscode` and push this local repository.
2. Create environments `npm`, `open-vsx`, and `marketplace`; require reviewers.
3. Enable private vulnerability reporting and Dependabot alerts.
4. Protect `main`; require pull requests and CI/CodeQL checks.
5. Protect release tags such as `v*`.

Before each release, update both workspace versions. `npm run version:check` rejects mismatches and verifies the Git tag in CI.
