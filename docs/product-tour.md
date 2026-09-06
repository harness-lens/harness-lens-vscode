<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright © 2026 Cristian Camargo Filho -->

# Product tour

These captures show the current early-preview extension running against a
complete local workspace report. Reports contain paths, counts, aggregate
metrics, and bounded evidence; they do not serialize source text or secrets.

## Workspace Observer

The Activity Bar view groups workspace assets, skills and references, findings,
context consumption, and runtime status. File references open in the editor;
directory references are revealed in Explorer.

![Harness Lens Workspace Observer](../packages/extension/media/screenshots/workspace-observer.png)

## Metrics overview

The metrics center reports coverage, discovered files, estimated context,
configured input cost, findings, quality, runtime state, and deterministic
change direction.

![Harness Lens metrics overview](../packages/extension/media/screenshots/metrics-overview.png)

## Partial coverage

When a configured scan limit stops discovery, the report identifies the exact
reason, excludes the partial snapshot from trend comparison, and still exposes
the bounded files, context, and findings it measured.

![Harness Lens partial workspace overview](../packages/extension/media/screenshots/partial-workspace-overview.png)

## Per-file context

The files table keeps byte size, context estimate, configured cost, finding
counts, and effectiveness state separate for each discovered asset.

![Harness Lens per-file context](../packages/extension/media/screenshots/per-file-context.png)

## Findings and evidence

Warnings link to their source location and show the rule, human-readable
message, bounded evidence, and assumptions used by heuristic checks.

![Harness Lens findings with evidence](../packages/extension/media/screenshots/findings-with-evidence.png)

## Scores and methods

Each score exposes its normalized value, threshold, method, sample size, state,
and reason. Safety violations stay separate from the quality average.

![Harness Lens findings and scores](../packages/extension/media/screenshots/findings-and-scores.png)

## Runtime and plugin execution

Optional runtime evidence starts off. Plugin execution remains observable with
status, duration, and failure detail.

![Harness Lens runtime and plugins](../packages/extension/media/screenshots/runtime-and-plugins.png)

## Local history

The extension keeps up to 100 content-free summaries per workspace for local
comparison.

![Harness Lens local history](../packages/extension/media/screenshots/local-history.png)

## Runtime settings

VS Code settings control the optional executable, runtime mode, period,
snapshot, and language-server lifecycle.

![Harness Lens runtime settings](../packages/extension/media/screenshots/runtime-settings.png)
