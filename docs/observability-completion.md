<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright © 2026 Cristian Camargo Filho -->

# Observability completion plan

Harness Lens should show whether a harness is getting cheaper, more stable,
and more effective, with evidence, method, asset identity, and inspectable
locations beside each claim. The dedicated VS Code interface combines Activity
Bar navigation with a metrics webview. Static analysis remains useful without
runtime evidence; optional runtime evidence never changes deterministic scores.

## This PR stack

- Core: content-free file measurements, configured input cost, provenance,
  inclusion edges, and provider-neutral runtime/effectiveness contracts.
  [Core PR #15](https://github.com/harness-lens/core/pull/15).
- SDK: bounded local Markdown-reference graph, explicit resolution states,
  cycle detection, and unsaved-buffer overlays. Uses immutable Core revision.
  [SDK PR #22](https://github.com/harness-lens/sdk/pull/22).
- Language server: per-file workspace reports, consent-controlled off/live/
  snapshot modes, bounded aggregate input, and stable observable failures.
  [Language-server PR #22](https://github.com/harness-lens/language-server/pull/22).
- CLI: the same immutable SDK revision, verified independently.
  [CLI PR #17](https://github.com/harness-lens/cli/pull/17).
- VS Code: files, skills, references, findings, context, costs, coverage,
  runtime status, and local history in Activity Bar and dedicated webview.
  Section navigation, file filtering, source navigation, runtime settings, and
  explicit refresh actions make these views usable without a separate app.

Merge Core before SDK, then consumers. The hub's submodule pins and repository
split documentation update only after owning PRs merge. Downstream PRs may be
reviewed before their dependencies merge because manifests pin immutable
published commits, not branch names or local paths.

## Completed local verification

- [x] Core formatting, Clippy, and tests.
- [x] SDK workspace formatting, Clippy, and tests against immutable Core SHA.
- [x] Extension type/version checks and model/rendering tests.
- [x] VSIX archive identity, content audit, reproducible SBOMs, and checksums.
- [x] Isolated Windows VS Code installation and extension-host activation,
  discovery, command registration, and metrics webview smoke.
- [x] Native Linux LSP duplicate lifecycle and content-free report smoke.

These checks do not establish that all features below exist or that registry
publication is configured. CI checks belong to each owning repository.

## Step 06: sanitized tool-call history

Owner: Core validation and aggregation contract, SDK/runtime adapter, then LSP
and VS Code presentation. Current CodeBurn integration supplies aggregates;
it does not yet provide attributed per-call traces.

- [ ] Define and validate a versioned input contract with tool/category, status,
  duration, retries, optional cost/unit, stable error class, model, asset,
  immutable revision, and time window. Reject unknown/raw payload fields.
- [ ] Bound input bytes, observation count, pagination, filters, and retained
  history. Keep errors, timeouts, cancellations, and retries distinct.
- [ ] Preserve absent cost and attribution as missing evidence, not zero.
- [ ] Prove stable error grouping, unsafe-input rejection, failure isolation,
  and static operation with runtime off or unavailable through fixtures.
- [ ] Add paginated/filterable tool history and aggregate success/error,
  timeout, retry, cancellation, latency, and observed-cost views to the tree
  and dedicated webview. Keep observed cost separate from static input cost.

## Step 07: attributed before/after comparisons

Owner: Core comparison methods, SDK attribution, then LSP and VS Code.

- [ ] Require matching asset identity, immutable baseline/current revisions,
  declared non-overlapping windows, sample sizes, and comparable observations.
- [ ] Define thresholds and uncertainty method for cost, stability, latency,
  retries, and outcomes. Expose assumptions and missing observations.
- [ ] Return `insufficient evidence` when attribution, comparison windows,
  sample size, or uncertainty is inadequate. Never infer per-file effectiveness
  from aggregate CodeBurn totals or static finding counts.
- [ ] Keep safety failures separate; correlation alone is not a causal claim.
- [ ] Add baseline/current selectors, distributions, explicit direction states,
  and per-asset evidence drill-down to the dedicated interface.
- [ ] Test improving, stable, degrading, mixed, and insufficient-evidence cases.

The current static snapshot-delta view compares complete report summaries.
It is not the attributed effectiveness implementation described above.

## Step 08: integration and publication

- [ ] All owning PR CI checks green; merge in dependency order.
- [ ] Verify CLI and native LSP independently with immutable dependency pins.
- [ ] Exercise a populated dashboard with a matching native server on Windows
  and WSL, including navigation, unsaved edits, trust, and runtime modes.
- [ ] Verify accessibility, keyboard navigation, light/dark themes, multi-root
  behavior, empty/partial/failed states, and bounded history in editor host.
- [ ] Rebuild final reviewed packages, SBOMs, and checksums after final changes.
- [ ] Configure protected registry environments and trusted publication or
  approved registry credentials; verify namespace and publisher ownership.
- [ ] Publish matching reviewed VSIX/npm artifacts; verify registry identity,
  version, checksums, and release provenance.
- [ ] Update hub submodule pins and split documentation last.

Publication and hub composition remain separate from opening these PRs.
