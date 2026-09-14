> SPDX-License-Identifier: MPL-2.0
> Copyright © 2026 Cristian Camargo Filho

# Changelog

## Unreleased

## 0.0.5

- Add bottom-centered ten-row pagination to warning and error findings.
- Center the Sankey and token chart in their available desktop space, scale the
  token plot to use that space without losing overflow, keep the turn slider
  directly below its chart, and move metrics below both on narrow screens.
- Refresh the Marketplace gallery around token navigation, workspace metrics,
  local history, and alignment with the active VS Code theme.

## 0.0.4

- Add a provider-neutral, accessible Sankey and equivalent table for measured
  adjacent action transitions, with bounded server-side filters and explicit
  evidence availability.
- Add a right-side Sankey inspector for selected actions and transitions,
  including bounded metrics, provenance, and side-by-side evidence navigation.
- Show the bounded evidence filename beneath each navigable Sankey action.
- Keep the Sankey, inspector, and flow controls aligned with responsive flex
  layouts and a taller compact-panel graph viewport.
- Add an accessible per-turn token lens below the Sankey with stacked input and
  output bars, cached-input markers, explicit evidence gaps, attributed cost,
  source navigation, and a synchronized turn slider.
- Add client-side search and ten-row, bottom-centered pagination to local
  report history.

## 0.0.3

- Add shared repository branding and the packaged Marketplace icon and banner.
- Add a checksum-verified Windows installer and uninstaller for the VSIX and
  matching native language server.
- Discover the coordinated Windows language-server installation automatically.
- Normalize Windows device paths and reveal referenced directories in Explorer.
- Add current product captures and direct links to extra configuration.
- Add typed provider catalog and aggregate protocol services.
- Require explicit CodeBurn provider consent in addition to runtime mode.
- Send workspace trust, virtual-workspace, and selected-provider policy during
  language-server initialization.
- Validate active runtime settings locally and fail closed without installing
  or bundling optional provider software.
- Scope process-wide runtime consent and mode consistently across multi-root
  VS Code windows.
- Reject malformed score ranges, derived pass states, sample sizes, and runtime
  issue classes at the protocol boundary.

## 0.0.2

- Add Harness Lens Activity Bar workspace observability tree.
- Add metrics section navigation, file filtering, and runtime settings/refresh actions.
- Add content-safe metrics center backed by bounded language-server reports.
- Add per-file context, configured cost, findings, provenance, references, and
  source navigation.
- Add local report history and deterministic improvement/degradation states.
- Add explicit `off`, `live`, and `snapshot` aggregate runtime modes; keep
  runtime off by default and preserve deterministic findings.
- Keep tool-call history and per-file effectiveness explicitly unmeasured until
  bounded attributable evidence exists.
- Mark the Marketplace extension as an early preview.
- Clarify the features available today and the features not yet implemented.
- Remove the linter category until validation is available.
- Add an external Rust language-server client with configurable binary path.
- Publish standard diagnostics compatible with Problems and Error Lens.

## 0.0.1

- Add workspace harness discovery command.
- Add detected-file status bar count.
- Add quick selection and file opening.
