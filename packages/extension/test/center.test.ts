// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assetSummaries,
  classifyTrend,
  parseWorkspaceReports,
  snapshot,
  type AnalysisReport,
} from "../src/center-model.ts";
import { centerHtml, escapeHtml } from "../src/center-view.ts";

function report(): AnalysisReport {
  return {
    schema_version: 1,
    root: "/workspace",
    completeness: { complete: true, reasons: [] },
    sources: [{ path: "AGENTS.md", kind: "instructions", scope: "", bytes: 80 }],
    findings: [{
      severity: "warning",
      rule_id: "HL010",
      message: "Repeated instruction",
      path: "AGENTS.md",
      line: 2,
      evidence: "normalized repeat",
      source: "harness-lens.repetition",
    }],
    metrics: [
      { name: "harness.source.estimated_tokens", value: 20, unit: "tokens", path: "AGENTS.md", source: "harness-lens.evaluation" },
      { name: "harness.source.input_cost_per_invocation", value: 0.00004, unit: "USD", path: "AGENTS.md", reference: "model/input@2026-09-05", source: "harness-lens.evaluation" },
      { name: "harness.source.input_cost_total", value: 0.004, unit: "USD", path: "AGENTS.md", reference: "model/input@2026-09-05", source: "harness-lens.evaluation" },
      { name: "harness.total_estimated_tokens", value: 20, unit: "tokens/invocation", source: "harness-lens.evaluation" },
      { name: "harness.input_cost_per_invocation", value: 0.00004, unit: "USD", reference: "model/input@2026-09-05", source: "harness-lens.evaluation" },
    ],
    scores: [{
      id: "harness.repetition_free",
      category: "quality",
      method: "deterministic",
      value: 0,
      threshold: 1,
      passed: false,
      sample_size: 8,
      reason: "Repeated instruction found",
      source: "harness-lens.repetition",
    }],
    score_summary: { quality_mean: 0.5, safety_violations: 0 },
    plugin_executions: [{
      id: "harness-lens.repetition",
      status: "completed",
      duration_micros: 250,
    }],
  };
}

test("parses workspace report and groups per-file evidence", () => {
  const parsed = parseWorkspaceReports({
    schemaVersion: 1,
    reports: [report()],
  });
  const assets = assetSummaries(parsed.reports[0]!);

  assert.equal(assets.length, 1);
  assert.deepEqual(assets[0], {
    path: "AGENTS.md",
    kind: "instructions",
    scope: "",
    bytes: 80,
    estimatedTokens: 20,
    inputCostPerInvocation: 0.00004,
    inputCostTotal: 0.004,
    costUnit: "USD",
    costReference: "model/input@2026-09-05",
    warnings: 1,
    errors: 0,
    findings: 1,
    effectiveness: null,
  });
});

test("rejects an unknown protocol schema", () => {
  assert.throws(
    () => parseWorkspaceReports({ schemaVersion: 2, reports: [] }),
    /Unsupported workspace report schema version/,
  );
});

test("classifies complete snapshot deltas conservatively", () => {
  const baseline = snapshot(report(), "2026-09-05T10:00:00Z");
  const improved = { ...baseline, recordedAt: "2026-09-05T11:00:00Z", warnings: 0 };
  assert.equal(classifyTrend([baseline]).state, "insufficient_evidence");
  assert.equal(classifyTrend([baseline, improved]).state, "improving");
  assert.equal(classifyTrend([improved, baseline]).state, "degrading");
  assert.equal(classifyTrend([baseline, { ...baseline, recordedAt: "2026-09-05T12:00:00Z" }]).state, "stable");
});

test("renders safe per-file metrics and explicit runtime gaps", () => {
  const value = report();
  value.sources[0]!.path = '<script>alert("x")</script>';
  value.findings = [];
  const html = centerHtml({ report: value, history: [snapshot(value)] }, "nonce");

  assert.ok(!html.includes('<script>alert("x")</script>'));
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Effectiveness/);
  assert.match(html, /Requires attributed runtime outcomes/);
  assert.match(html, /Tool-call runtime/);
  assert.equal(escapeHtml("<&"), "&lt;&amp;");
});
