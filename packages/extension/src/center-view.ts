// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import {
  aggregateMetric,
  assetSummaries,
  classifyTrend,
  type AnalysisReport,
  type HistorySnapshot,
} from "./center-model.js";

export interface CenterViewState {
  report?: AnalysisReport;
  history: HistorySnapshot[];
  error?: string;
}

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function amount(value: number | null, digits = 2): string {
  return value === null
    ? "Not measured"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function percentage(value: number | null): string {
  return value === null ? "Not measured" : `${amount(value * 100, 1)}%`;
}

function historyChart(history: readonly HistorySnapshot[]): string {
  const entries = history.filter((entry) => entry.complete).slice(-20);
  if (entries.length < 2) {
    return '<p class="muted">Record two complete reports to render trend history.</p>';
  }
  const maximum = Math.max(1, ...entries.map((entry) => entry.errors + entry.warnings));
  const denominator = Math.max(1, entries.length - 1);
  const points = entries.map((entry, index) => {
    const x = 12 + index * 576 / denominator;
    const y = 94 - (entry.errors + entry.warnings) * 72 / maximum;
    return `${x},${y}`;
  }).join(" ");
  return `<svg class="trend" viewBox="0 0 600 110" role="img" aria-label="Warning and error count history">
    <line x1="12" y1="94" x2="588" y2="94" />
    <polyline points="${points}" />
  </svg>`;
}

function reportBody(report: AnalysisReport, history: readonly HistorySnapshot[]): string {
  const assets = assetSummaries(report);
  const warnings = report.findings.filter((finding) => finding.severity === "warning").length;
  const errors = report.findings.filter((finding) => finding.severity === "error").length;
  const tokens = aggregateMetric(report, "harness.total_estimated_tokens");
  const costMetric = report.metrics.find((metric) => metric.name === "harness.input_cost_per_invocation");
  const cost = costMetric?.value ?? null;
  const trend = classifyTrend(history);
  const incomplete = report.completeness.complete
    ? "Complete"
    : `Partial: ${report.completeness.reasons.map((reason) => reason.code).join(", ")}`;

  const assetRows = assets.map((asset) => `<tr>
    <td><button class="link" data-open="${escapeHtml(asset.path)}">${escapeHtml(asset.path)}</button><small>${escapeHtml(asset.kind)} · scope ${escapeHtml(asset.scope)}</small></td>
    <td>${amount(asset.bytes, 0)}</td>
    <td>${amount(asset.estimatedTokens, 0)}<small>estimated: Unicode scalar count / 4</small></td>
    <td>${amount(asset.inputCostPerInvocation, 6)} ${escapeHtml(asset.costUnit ?? "")}<small>${asset.costReference ? escapeHtml(asset.costReference) : "No pricing reference"}</small></td>
    <td>${amount(asset.inputCostTotal, 6)} ${escapeHtml(asset.costUnit ?? "")}</td>
    <td>${asset.errors} error · ${asset.warnings} warning</td>
    <td><span class="unknown">Not measured</span><small>Requires attributed runtime outcomes</small></td>
  </tr>`).join("");

  const findingRows = report.findings
    .filter((finding) => finding.severity !== "pass")
    .map((finding) => `<tr>
      <td><span class="severity ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span></td>
      <td>${escapeHtml(finding.rule_id)}</td>
      <td>${finding.path
        ? `<button class="link" data-open="${escapeHtml(finding.path)}" data-line="${finding.line ?? 1}">${escapeHtml(finding.path)}:${finding.line ?? 1}</button>`
        : "Workspace"}</td>
      <td>${escapeHtml(finding.message)}${finding.evidence ? `<small>${escapeHtml(finding.evidence)}</small>` : ""}</td>
    </tr>`).join("");

  const scoreRows = report.scores.map((score) => `<tr>
    <td>${escapeHtml(score.id)}</td>
    <td>${percentage(score.value)}</td>
    <td>${percentage(score.threshold)}</td>
    <td>${escapeHtml(score.method)}</td>
    <td>${score.sample_size ?? "Not supplied"}</td>
    <td>${score.passed ? "Pass" : "Fail"}<small>${escapeHtml(score.reason)}</small></td>
  </tr>`).join("");

  const pluginRows = report.plugin_executions.map((plugin) => `<tr>
    <td>${escapeHtml(plugin.id)}</td>
    <td>${escapeHtml(plugin.status)}</td>
    <td>${amount(plugin.duration_micros / 1_000, 3)} ms</td>
    <td>${plugin.message ? escapeHtml(plugin.message) : "—"}</td>
  </tr>`).join("");

  const historyRows = [...history].reverse().map((entry) => `<tr>
    <td>${escapeHtml(new Date(entry.recordedAt).toLocaleString())}</td>
    <td>${entry.complete ? "Complete" : "Partial"}</td>
    <td>${entry.files}</td>
    <td>${amount(entry.estimatedTokens, 0)}</td>
    <td>${entry.errors}</td>
    <td>${entry.warnings}</td>
    <td>${percentage(entry.qualityMean)}</td>
  </tr>`).join("");

  return `<div class="summary">
    <article><small>Coverage</small><strong>${escapeHtml(incomplete)}</strong></article>
    <article><small>Harness files</small><strong>${report.sources.length}</strong></article>
    <article><small>Estimated context</small><strong>${amount(tokens, 0)} tokens</strong></article>
    <article><small>Static input cost</small><strong>${amount(cost, 6)} ${escapeHtml(costMetric?.unit ?? "")}</strong><small>per harness invocation</small></article>
    <article><small>Findings</small><strong>${errors} error · ${warnings} warning</strong></article>
    <article><small>Quality</small><strong>${percentage(report.score_summary.quality_mean)}</strong><small>Safety: ${report.score_summary.safety_violations}</small></article>
  </div>

  <section>
    <div class="section-title"><div><h2>Change direction</h2><p>${escapeHtml(trend.reason)}</p></div><span class="trend-state ${trend.state}">${escapeHtml(trend.state.replace("_", " "))}</span></div>
    ${historyChart(history)}
    <p class="method">Method: deterministic snapshot delta. Any increased error/warning count or reduced aggregate quality means degrading. Only complete reports participate.</p>
  </section>

  <section>
    <h2>Files and instructions</h2>
    <p>Per-file cost and quality evidence. Effectiveness remains unmeasured until runtime outcomes can be attributed to an exact asset.</p>
    <div class="scroll"><table><thead><tr><th>File</th><th>Bytes</th><th>Context</th><th>Input cost / invocation</th><th>Configured total cost</th><th>Findings</th><th>Effectiveness</th></tr></thead><tbody>${assetRows || '<tr><td colspan="7">No harness files found.</td></tr>'}</tbody></table></div>
  </section>

  <section>
    <h2>Findings</h2>
    <div class="scroll"><table><thead><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Evidence</th></tr></thead><tbody>${findingRows || '<tr><td colspan="4">No warning or error findings.</td></tr>'}</tbody></table></div>
  </section>

  <section>
    <h2>Scores and methods</h2>
    <div class="scroll"><table><thead><tr><th>Score</th><th>Value</th><th>Threshold</th><th>Method</th><th>Sample</th><th>State</th></tr></thead><tbody>${scoreRows}</tbody></table></div>
  </section>

  <section>
    <h2>Tool-call runtime</h2>
    <div class="empty"><strong>Not measured</strong><p>Tool errors, retries, timeouts, cost per call, and successful-call cost require a versioned sanitized runtime trace. Static harness cost above is not runtime tool cost.</p></div>
  </section>

  <section>
    <h2>Plugin execution</h2>
    <div class="scroll"><table><thead><tr><th>Plugin</th><th>Status</th><th>Duration</th><th>Detail</th></tr></thead><tbody>${pluginRows}</tbody></table></div>
  </section>

  <section>
    <h2>Local history</h2>
    <p>Content-free summaries only. Maximum 100 snapshots per workspace.</p>
    <div class="scroll"><table><thead><tr><th>Recorded</th><th>Coverage</th><th>Files</th><th>Tokens</th><th>Errors</th><th>Warnings</th><th>Quality</th></tr></thead><tbody>${historyRows}</tbody></table></div>
  </section>`;
}

export function centerHtml(state: CenterViewState, nonce: string): string {
  const body = state.report
    ? reportBody(state.report, state.history)
    : `<section class="empty"><strong>No report loaded</strong><p>${escapeHtml(state.error ?? "Start the Harness Lens language server, then refresh.")}</p></section>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font: var(--vscode-font-size)/1.45 var(--vscode-font-family); margin: 0; }
  header { align-items: center; border-bottom: 1px solid var(--vscode-panel-border); display: flex; justify-content: space-between; padding: 18px 24px; position: sticky; top: 0; background: var(--vscode-editor-background); z-index: 2; }
  h1, h2 { margin: 0; } h1 { font-size: 20px; } h2 { font-size: 16px; }
  main { display: grid; gap: 16px; padding: 20px 24px 40px; }
  section, article { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
  section { padding: 16px; } section > p, .section-title p { color: var(--vscode-descriptionForeground); margin: 5px 0 14px; }
  .summary { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
  article { display: grid; gap: 5px; min-height: 72px; padding: 14px; }
  article strong { font-size: 17px; } small { color: var(--vscode-descriptionForeground); display: block; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; cursor: pointer; padding: 7px 12px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.link { background: transparent; color: var(--vscode-textLink-foreground); padding: 0; text-align: left; }
  .scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; } th, td { border-bottom: 1px solid var(--vscode-panel-border); padding: 9px 10px; text-align: left; vertical-align: top; } th { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; }
  .section-title { align-items: start; display: flex; justify-content: space-between; gap: 15px; }
  .trend-state, .severity { border: 1px solid currentColor; display: inline-block; padding: 2px 7px; text-transform: capitalize; }
  .improving, .pass { color: var(--vscode-testing-iconPassed); } .degrading, .error { color: var(--vscode-testing-iconFailed); } .warning { color: var(--vscode-editorWarning-foreground); } .stable, .info { color: var(--vscode-editorInfo-foreground); } .insufficient_evidence, .unknown { color: var(--vscode-descriptionForeground); }
  .trend { height: 120px; width: 100%; } .trend line { stroke: currentColor; opacity: .2; } .trend polyline { fill: none; stroke: var(--vscode-charts-blue); stroke-width: 2; }
  .method, .empty { color: var(--vscode-descriptionForeground); } .empty { padding: 22px; text-align: center; }
  @media (max-width: 700px) { header { padding: 14px; } main { padding: 14px; } .summary { grid-template-columns: 1fr 1fr; } }
</style></head><body>
<header><div><h1>Harness Lens</h1><small>Evidence-backed workspace observability</small></div><button id="refresh">Refresh report</button></header>
<main>${body}</main>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  document.querySelectorAll('[data-open]').forEach((element) => element.addEventListener('click', () => vscode.postMessage({ type: 'open', path: element.dataset.open, line: Number(element.dataset.line || 1) })));
</script></body></html>`;
}
