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
    sources: [{
      path: "AGENTS.md",
      kind: "instructions",
      scope: "",
      bytes: 80,
      characters: null,
      lines: null,
      inclusionDepth: null,
      tokenEstimate: null,
      configuredInputCost: null,
      findingsCount: null,
      provenance: [],
    }],
    inclusions: [],
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
    characters: null,
    lines: null,
    inclusionDepth: null,
    tokenEstimate: null,
    configuredInputCost: null,
    findingsCount: null,
    provenance: [],
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
  assert.equal(parsed.runtime.mode, "off");
  assert.equal(parsed.runtime.state, "off");
});

test("parses enriched file records and inclusion edges", () => {
  const raw = report() as unknown as Record<string, unknown>;
  raw.sources = [{
    path: "AGENTS.md",
    kind: "agents",
    scope: "",
    bytes: 20,
    characters: 18,
    lines: 2,
    inclusion_depth: 0,
    estimated_tokens: {
      value: 5,
      tokenizer: "unicode_scalar_div_4",
      basis: "Unicode scalar count divided by four",
      method: "heuristic",
    },
    findings_count: 1,
    provenance: [{
      relationship: "direct_discovery",
      path: "AGENTS.md",
      method: "deterministic",
    }],
  }];
  raw.inclusions = [{
    source: "AGENTS.md",
    target: "missing.md",
    depth: 1,
    status: "missing",
    method: "heuristic",
    assumptions: ["Local inline Markdown links are inclusion candidates"],
  }];

  const parsed = parseWorkspaceReports({ schemaVersion: 1, reports: [raw] });
  assert.equal(parsed.reports[0]!.sources[0]!.characters, 18);
  assert.equal(parsed.reports[0]!.sources[0]!.tokenEstimate?.value, 5);
  assert.equal(parsed.reports[0]!.inclusions[0]!.status, "missing");
});

test("parses bounded safe runtime status", () => {
  const parsed = parseWorkspaceReports({
    schemaVersion: 1,
    reports: [report()],
    runtime: {
      mode: "snapshot",
      state: "failed",
      issue: "invalid_data",
      period: "30days",
      calls: 12,
      sessions: 3,
      warningCount: 1,
      hasSnapshot: true,
    },
  });
  assert.deepEqual(parsed.runtime, {
    mode: "snapshot",
    state: "failed",
    issue: "invalid_data",
    period: "30days",
    calls: 12,
    sessions: 3,
    warningCount: 1,
    hasSnapshot: true,
  });
});

test("rejects an unknown protocol schema", () => {
  assert.throws(
    () => parseWorkspaceReports({ schemaVersion: 2, reports: [] }),
    /Unsupported workspace report schema version/,
  );
});

test("rejects malformed scores and runtime status at the protocol boundary", () => {
  const invalidScore = (change: Record<string, unknown>): Record<string, unknown> => {
    const value = structuredClone(report()) as unknown as Record<string, unknown>;
    value.scores = [{
      ...(value.scores as Record<string, unknown>[])[0],
      ...change,
    }];
    return value;
  };

  assert.throws(
    () => parseWorkspaceReports({ schemaVersion: 1, reports: [invalidScore({ value: 2 })] }),
    /score.value must be between 0.0 and 1.0/,
  );
  assert.throws(
    () => parseWorkspaceReports({ schemaVersion: 1, reports: [invalidScore({ method: "opaque" })] }),
    /Unsupported score method/,
  );
  assert.throws(
    () => parseWorkspaceReports({ schemaVersion: 1, reports: [invalidScore({ passed: true })] }),
    /score.passed must be derived/,
  );
  assert.throws(
    () => parseWorkspaceReports({
      schemaVersion: 1,
      reports: [invalidScore({ method: "statistical", sample_size: null })],
    }),
    /Statistical score requires/,
  );
  assert.throws(
    () => parseWorkspaceReports({
      schemaVersion: 1,
      reports: [invalidScore({ sample_size: -1 })],
    }),
    /score.sample_size must be a non-negative safe integer/,
  );

  const invalidSummary = structuredClone(report()) as unknown as Record<string, unknown>;
  invalidSummary.score_summary = { quality_mean: 2, safety_violations: -1 };
  assert.throws(
    () => parseWorkspaceReports({ schemaVersion: 1, reports: [invalidSummary] }),
    /score_summary.quality_mean must be between 0.0 and 1.0/,
  );
  assert.throws(
    () => parseWorkspaceReports({
      schemaVersion: 1,
      reports: [report()],
      runtime: {
        mode: "off",
        state: "off",
        issue: "raw arbitrary detail",
        period: "",
        calls: 0,
        sessions: 0,
        warningCount: 0,
        hasSnapshot: false,
      },
    }),
    /Unsupported runtime issue/,
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
  const html = centerHtml({
    report: value,
    history: [snapshot(value)],
    runtime: {
      mode: "live",
      state: "ready",
      period: "30days",
      calls: 12,
      sessions: 3,
      warningCount: 0,
      hasSnapshot: true,
    },
  }, "nonce");

  assert.ok(!html.includes('<script>alert("x")</script>'));
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Effectiveness/);
  assert.match(html, /Requires attributed runtime outcomes/);
  assert.match(html, /Runtime history/);
  assert.match(html, /12 calls/);
  assert.match(html, /Tool errors, retries, timeouts/);
  assert.equal(escapeHtml("<&"), "&lt;&amp;");
});

test("marks a retained report stale when refresh fails without rendering raw errors", () => {
  const html = centerHtml({
    report: report(),
    history: [],
    error: '<img src=x onerror="alert(1)">',
  }, "nonce");
  assert.match(html, /role="alert"/);
  assert.match(html, /Refresh failed\. Previous report retained\./);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x/);
});
