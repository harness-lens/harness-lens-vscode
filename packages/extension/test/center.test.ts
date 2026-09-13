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
import {
  defaultObservedFlowFilters,
  type GraphAvailability,
  type ObservedFlowResponse,
} from "../src/observed-flow-service.ts";

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
    flowFilters: defaultObservedFlowFilters,
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
  assert.match(html, /Sanitized ordered action evidence is shown separately/);
  assert.equal(escapeHtml("<&"), "&lt;&amp;");
});

test("marks a retained report stale when refresh fails without rendering raw errors", () => {
  const html = centerHtml({
    report: report(),
    history: [],
    flowFilters: defaultObservedFlowFilters,
    error: '<img src=x onerror="alert(1)">',
  }, "nonce");
  assert.match(html, /role="alert"/);
  assert.match(html, /Refresh failed\. Previous report retained\./);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x/);
});

test("renders populated cyclic Sankey with proportional widths and accessible table", () => {
  const flow = flowResponse("ready");
  flow.graph.limits.maxHops = 4;
  flow.graph.filters = {
    root: "read",
    window: { start: "a", end: "z" },
    categories: ["tool"],
    statuses: ["success"],
    minimumShare: 0.1,
    metricUnit: "transitions",
  };
  const html = centerHtml({
    report: report(),
    history: [],
    flow,
    flowFilters: {
      root: "read",
      maxHops: 4,
      windowStart: "a",
      windowEnd: "z",
      categories: ["tool"],
      statuses: ["success"],
      minimumShare: 0.1,
      metric: "transitions",
    },
  }, "nonce");
  assert.match(html, /class="flow-chart"/);
  assert.match(html, /id="flow-inspector"/);
  assert.match(html, /Select a flow item/);
  assert.match(html, /data-flow-selection="edge-0"/);
  assert.match(html, /data-flow-selection="node-0"/);
  assert.match(html, /aria-controls="flow-inspector-content"/);
  assert.match(html, /Observed transition/);
  assert.match(html, /Action node/);
  assert.match(html, /Keyboard-accessible observed transition data/);
  assert.match(html, /Filtered denominator/);
  assert.match(html, /3 transitions/);
  assert.match(html, /sample/i);
  assert.match(html, /Layered copies preserve canonical logical identity/);
  assert.match(html, /data-flow-uri="file:\/\/\/workspace\/AGENTS.md"/);
  assert.match(html, /@media \(forced-colors: active\)/);
  assert.match(html, /value="read"/);
  assert.match(html, /Active filters: root read/);
  const widths = [...html.matchAll(/class="flow-edge[^>]+stroke-width="([^"]+)"/g)]
    .map((match) => Number(match[1]));
  assert.equal(widths.length, 2);
  assert.ok(Math.abs(widths[0]! / widths[1]! - 3) < 1e-9);
});

test("renders searchable, paginated local history controls", () => {
  const value = report();
  const history = Array.from({ length: 12 }, (_, index) => ({
    ...snapshot(value, `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00Z`),
    files: index + 1,
  }));
  const html = centerHtml({
    report: value,
    history,
    flowFilters: defaultObservedFlowFilters,
  }, "nonce");

  assert.equal([...html.matchAll(/<tr data-history-row>/g)].length, 12);
  assert.match(html, /id="history" data-history-page-size="10"/);
  assert.match(html, /id="history-search" type="search"/);
  assert.match(html, /id="history-previous"/);
  assert.match(html, /id="history-page-status"/);
  assert.match(html, /id="history-next"/);
  assert.match(html, /\.history-pagination \{[^}]*justify-content: center/);
  assert.match(html, /Math\.ceil\(matching\.length \/ historyPageSize\)/);
  assert.ok(html.indexOf('id="history-search"') < html.indexOf("data-history-row"));
  assert.ok(html.lastIndexOf("<tr data-history-row>") < html.indexOf('id="history-next"'));
});

test("renders unavailable, insufficient, empty, partial, truncated, and filtered states", () => {
  const cases: readonly [GraphAvailability, RegExp][] = [
    ["unavailable", /missing evidence, not zero activity/i],
    ["insufficient_evidence", /cannot establish an ordered transition/i],
    ["empty", /no transitions matching the active filters/i],
  ];
  for (const [availability, expected] of cases) {
    const html = centerHtml({
      report: report(),
      history: [],
      flow: flowResponse(availability),
      flowFilters: defaultObservedFlowFilters,
    }, "nonce");
    assert.match(html, expected);
    assert.ok(!html.includes('class="flow-chart"'));
  }

  const partial = flowResponse("ready");
  partial.status.state = "partial";
  partial.graph.completeness = {
    complete: false,
    reasons: [{ code: "truncated_edges", count: 2 }],
  };
  partial.graph.filters = {
    ...partial.graph.filters,
    categories: ["tool"],
    statuses: ["timeout"],
    minimumShare: 0.2,
  };
  const html = centerHtml({
    report: report(),
    history: [],
    flow: partial,
    flowFilters: {
      ...defaultObservedFlowFilters,
      categories: ["tool"],
      statuses: ["timeout"],
      minimumShare: 0.2,
    },
  }, "nonce");
  assert.match(html, /partial \/ ready/i);
  assert.match(html, /Partial: truncated_edges \(2\)/);
  assert.match(html, /categories tool/);
  assert.match(html, /statuses timeout/);
  assert.match(html, /minimum share 0.2/);
});

function flowResponse(availability: GraphAvailability): ObservedFlowResponse {
  const ready = availability === "ready";
  const provenance = {
    source: "harness-lens-sdk",
    method: "statistical" as const,
    evidenceIds: ["observation-2"],
    totalEvidence: 1,
    location: {
      uri: "file:///workspace/AGENTS.md",
      range: {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 4 },
      },
    },
  };
  const nodes = ready
    ? [
        { id: "n0", logicalId: "read", label: "Read", kind: "action" as const, layer: 0, provenance: [] },
        { id: "n1", logicalId: "write", label: "Write", kind: "action" as const, layer: 1, provenance: [provenance] },
        { id: "n2", logicalId: "read", label: "Read", kind: "action" as const, layer: 2, provenance: [] },
      ]
    : availability === "insufficient_evidence"
      ? [{ id: "n0", logicalId: "read", label: "Read", kind: "action" as const, layer: 0, provenance: [] }]
      : [];
  const metric = (value: number, sampleSize: number) => ({
    value,
    unit: "transitions",
    denominator: 4,
    share: value / 4,
    sampleSize,
    window: { start: "a", end: "z" },
  });
  return {
    schemaVersion: 1,
    rootUri: "file:///workspace",
    status: {
      state: availability === "unavailable" ? "off" : "ready",
      generation: ready ? 1 : 0,
      ...(ready ? { lastSuccess: 1 } : {}),
      hasSnapshot: availability !== "unavailable",
      observations: ready ? 5 : availability === "insufficient_evidence" ? 1 : 2,
      sessions: availability === "unavailable" ? 0 : 1,
    },
    graph: {
      schemaVersion: 1,
      kind: "observed_flow",
      method: "statistical",
      availability,
      completeness: availability === "unavailable"
        ? { complete: false, reasons: [{ code: "runtime_off" }] }
        : { complete: true, reasons: [] },
      limits: { maxNodes: 256, maxEdges: 512, maxHops: 32 },
      filters: {
        categories: [],
        statuses: [],
        metricUnit: "transitions",
      },
      nodes,
      edges: ready
        ? [
            {
              id: "e0",
              source: "n0",
              target: "n1",
              relationship: "observed_transition",
              method: "statistical",
              metric: metric(3, 3),
              provenance: [provenance],
            },
            {
              id: "e1",
              source: "n1",
              target: "n2",
              relationship: "observed_transition",
              method: "statistical",
              metric: metric(1, 1),
              provenance: [],
            },
          ]
        : [],
    },
  };
}
