// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

export interface SourceRecord {
  path: string;
  kind: string;
  scope: string;
  bytes: number;
  characters: number | null;
  lines: number | null;
  inclusionDepth: number | null;
  tokenEstimate: TokenEstimate | null;
  configuredInputCost: ConfiguredInputCost | null;
  findingsCount: number | null;
  provenance: ProvenanceLink[];
}

export interface TokenEstimate {
  value: number;
  tokenizer: string;
  basis: string;
  method: string;
}

export interface ConfiguredInputCost {
  value: number;
  unit: string;
  reference?: string;
  method: string;
}

export interface ProvenanceLink {
  relationship: string;
  path: string;
  method: string;
}

export interface InclusionEdge {
  source?: string;
  target: string;
  depth: number;
  status: "resolved" | "missing" | "cycle" | "ignored" | "out_of_root" | "unavailable";
  method: string;
  assumptions: string[];
}

export interface Finding {
  severity: "pass" | "info" | "warning" | "error";
  rule_id: string;
  message: string;
  path?: string;
  line?: number;
  evidence?: string;
  source: string;
}

export interface Metric {
  name: string;
  value: number;
  unit?: string;
  path?: string;
  reference?: string;
  source: string;
}

export interface Score {
  id: string;
  category: string;
  method: string;
  value: number;
  threshold: number;
  passed: boolean;
  sample_size?: number;
  reason: string;
  source: string;
}

export interface PluginExecution {
  id: string;
  status: string;
  duration_micros: number;
  message?: string;
}

export interface AnalysisReport {
  schema_version: number;
  root: string;
  completeness: {
    complete: boolean;
    reasons: { code: string; path?: string }[];
  };
  sources: SourceRecord[];
  inclusions: InclusionEdge[];
  findings: Finding[];
  metrics: Metric[];
  scores: Score[];
  score_summary: { quality_mean: number | null; safety_violations: number };
  plugin_executions: PluginExecution[];
}

export interface WorkspaceReports {
  schemaVersion: number;
  reports: AnalysisReport[];
  runtime: RuntimeStatus;
}

export interface RuntimeStatus {
  mode: "off" | "live" | "snapshot";
  state: "off" | "loading" | "ready" | "failed" | "invalid";
  issue?: string;
  period: string;
  calls: number;
  sessions: number;
  warningCount: number;
  hasSnapshot: boolean;
}

export interface AssetSummary extends SourceRecord {
  estimatedTokens: number | null;
  inputCostPerInvocation: number | null;
  inputCostTotal: number | null;
  costUnit: string | null;
  costReference: string | null;
  warnings: number;
  errors: number;
  findings: number;
  effectiveness: null;
}

export interface HistorySnapshot {
  recordedAt: string;
  complete: boolean;
  files: number;
  estimatedTokens: number | null;
  warnings: number;
  errors: number;
  qualityMean: number | null;
}

export interface Trend {
  state: "improving" | "stable" | "degrading" | "insufficient_evidence";
  reason: string;
  method: "deterministic_snapshot_delta";
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function optionalText(value: unknown, label: string): string | undefined {
  return value === undefined || value === null ? undefined : text(value, label);
}

function optionalNumber(value: unknown, label: string): number | undefined {
  return value === undefined || value === null ? undefined : finite(value, label);
}

function optionalObject(value: unknown, label: string): Record<string, unknown> | undefined {
  return value === undefined || value === null ? undefined : object(value, label);
}

function parseSource(value: unknown): SourceRecord {
  const source = object(value, "source");
  const token = optionalObject(source.estimated_tokens, "source.estimated_tokens");
  const cost = optionalObject(source.configured_input_cost, "source.configured_input_cost");
  const costReference = cost
    ? optionalText(cost.reference, "configured cost.reference")
    : undefined;
  return {
    path: text(source.path, "source.path"),
    kind: text(source.kind, "source.kind"),
    scope: text(source.scope, "source.scope"),
    bytes: finite(source.bytes, "source.bytes"),
    characters: optionalNumber(source.characters, "source.characters") ?? null,
    lines: optionalNumber(source.lines, "source.lines") ?? null,
    inclusionDepth: optionalNumber(source.inclusion_depth, "source.inclusion_depth") ?? null,
    tokenEstimate: token ? {
      value: finite(token.value, "token estimate.value"),
      tokenizer: text(token.tokenizer, "token estimate.tokenizer"),
      basis: text(token.basis, "token estimate.basis"),
      method: text(token.method, "token estimate.method"),
    } : null,
    configuredInputCost: cost ? {
      value: finite(cost.value, "configured cost.value"),
      unit: text(cost.unit, "configured cost.unit"),
      ...(costReference === undefined ? {} : { reference: costReference }),
      method: text(cost.method, "configured cost.method"),
    } : null,
    findingsCount: optionalNumber(source.findings_count, "source.findings_count") ?? null,
    provenance: source.provenance === undefined
      ? []
      : array(source.provenance, "source.provenance").map((value) => {
          const link = object(value, "provenance link");
          return {
            relationship: text(link.relationship, "provenance.relationship"),
            path: text(link.path, "provenance.path"),
            method: text(link.method, "provenance.method"),
          };
        }),
  };
}

function parseInclusion(value: unknown): InclusionEdge {
  const edge = object(value, "inclusion edge");
  const status = text(edge.status, "inclusion.status");
  if (!["resolved", "missing", "cycle", "ignored", "out_of_root", "unavailable"].includes(status)) {
    throw new Error(`Unsupported inclusion status: ${status}.`);
  }
  const source = optionalText(edge.source, "inclusion.source");
  return {
    ...(source === undefined ? {} : { source }),
    target: text(edge.target, "inclusion.target"),
    depth: finite(edge.depth, "inclusion.depth"),
    status: status as InclusionEdge["status"],
    method: text(edge.method, "inclusion.method"),
    assumptions: edge.assumptions === undefined
      ? []
      : array(edge.assumptions, "inclusion.assumptions")
        .map((assumption) => text(assumption, "inclusion assumption")),
  };
}

function parseFinding(value: unknown): Finding {
  const finding = object(value, "finding");
  const severity = text(finding.severity, "finding.severity");
  if (!["pass", "info", "warning", "error"].includes(severity)) {
    throw new Error(`Unsupported finding severity: ${severity}.`);
  }
  const path = optionalText(finding.path, "finding.path");
  const line = optionalNumber(finding.line, "finding.line");
  const evidence = optionalText(finding.evidence, "finding.evidence");
  return {
    severity: severity as Finding["severity"],
    rule_id: text(finding.rule_id, "finding.rule_id"),
    message: text(finding.message, "finding.message"),
    ...(path === undefined ? {} : { path }),
    ...(line === undefined ? {} : { line }),
    ...(evidence === undefined ? {} : { evidence }),
    source: text(finding.source, "finding.source"),
  };
}

function parseMetric(value: unknown): Metric {
  const metric = object(value, "metric");
  const unit = optionalText(metric.unit, "metric.unit");
  const path = optionalText(metric.path, "metric.path");
  const reference = optionalText(metric.reference, "metric.reference");
  return {
    name: text(metric.name, "metric.name"),
    value: finite(metric.value, "metric.value"),
    ...(unit === undefined ? {} : { unit }),
    ...(path === undefined ? {} : { path }),
    ...(reference === undefined ? {} : { reference }),
    source: text(metric.source, "metric.source"),
  };
}

function parseScore(value: unknown): Score {
  const score = object(value, "score");
  const sampleSize = optionalNumber(score.sample_size, "score.sample_size");
  return {
    id: text(score.id, "score.id"),
    category: text(score.category, "score.category"),
    method: text(score.method, "score.method"),
    value: finite(score.value, "score.value"),
    threshold: finite(score.threshold, "score.threshold"),
    passed: boolean(score.passed, "score.passed"),
    ...(sampleSize === undefined ? {} : { sample_size: sampleSize }),
    reason: text(score.reason, "score.reason"),
    source: text(score.source, "score.source"),
  };
}

function parsePlugin(value: unknown): PluginExecution {
  const plugin = object(value, "plugin execution");
  const message = optionalText(plugin.message, "plugin.message");
  return {
    id: text(plugin.id, "plugin.id"),
    status: text(plugin.status, "plugin.status"),
    duration_micros: finite(plugin.duration_micros, "plugin.duration_micros"),
    ...(message === undefined ? {} : { message }),
  };
}

function parseReport(value: unknown): AnalysisReport {
  const report = object(value, "analysis report");
  const completeness = object(report.completeness, "report.completeness");
  const scoreSummary = object(report.score_summary, "report.score_summary");
  const quality = scoreSummary.quality_mean;
  return {
    schema_version: finite(report.schema_version, "report.schema_version"),
    root: text(report.root, "report.root"),
    completeness: {
      complete: boolean(completeness.complete, "report.completeness.complete"),
      reasons: array(completeness.reasons, "report.completeness.reasons").map((value) => {
        const reason = object(value, "incomplete reason");
        const path = optionalText(reason.path, "reason.path");
        return {
          code: text(reason.code, "reason.code"),
          ...(path === undefined ? {} : { path }),
        };
      }),
    },
    sources: array(report.sources, "report.sources").map(parseSource),
    inclusions: report.inclusions === undefined
      ? []
      : array(report.inclusions, "report.inclusions").map(parseInclusion),
    findings: array(report.findings, "report.findings").map(parseFinding),
    metrics: array(report.metrics, "report.metrics").map(parseMetric),
    scores: array(report.scores, "report.scores").map(parseScore),
    score_summary: {
      quality_mean: quality === null || quality === undefined
        ? null
        : finite(quality, "score_summary.quality_mean"),
      safety_violations: finite(
        scoreSummary.safety_violations,
        "score_summary.safety_violations",
      ),
    },
    plugin_executions: array(report.plugin_executions, "report.plugin_executions").map(parsePlugin),
  };
}

export function parseWorkspaceReports(value: unknown): WorkspaceReports {
  const envelope = object(value, "workspace report response");
  const schemaVersion = finite(envelope.schemaVersion, "workspace report schemaVersion");
  if (schemaVersion !== 1) {
    throw new Error(`Unsupported workspace report schema version: ${schemaVersion}.`);
  }
  return {
    schemaVersion,
    reports: array(envelope.reports, "workspace reports").map(parseReport),
    runtime: parseRuntimeStatus(envelope.runtime),
  };
}

function parseRuntimeStatus(value: unknown): RuntimeStatus {
  if (value === undefined || value === null) {
    return {
      mode: "off",
      state: "off",
      period: "",
      calls: 0,
      sessions: 0,
      warningCount: 0,
      hasSnapshot: false,
    };
  }
  const runtime = object(value, "runtime status");
  const mode = text(runtime.mode, "runtime.mode");
  const state = text(runtime.state, "runtime.state");
  if (!["off", "live", "snapshot"].includes(mode)) {
    throw new Error(`Unsupported runtime mode: ${mode}.`);
  }
  if (!["off", "loading", "ready", "failed", "invalid"].includes(state)) {
    throw new Error(`Unsupported runtime state: ${state}.`);
  }
  const issue = optionalText(runtime.issue, "runtime.issue");
  return {
    mode: mode as RuntimeStatus["mode"],
    state: state as RuntimeStatus["state"],
    ...(issue === undefined ? {} : { issue }),
    period: text(runtime.period, "runtime.period"),
    calls: finite(runtime.calls, "runtime.calls"),
    sessions: finite(runtime.sessions, "runtime.sessions"),
    warningCount: finite(runtime.warningCount, "runtime.warningCount"),
    hasSnapshot: boolean(runtime.hasSnapshot, "runtime.hasSnapshot"),
  };
}

function metric(report: AnalysisReport, name: string, path?: string): Metric | undefined {
  return report.metrics.find((candidate) =>
    candidate.name === name && candidate.path === path);
}

export function assetSummaries(report: AnalysisReport): AssetSummary[] {
  return report.sources.map((source) => {
    const findings = report.findings.filter((finding) => finding.path === source.path);
    const perInvocation = metric(
      report,
      "harness.source.input_cost_per_invocation",
      source.path,
    );
    return {
      ...source,
      estimatedTokens: metric(
        report,
        "harness.source.estimated_tokens",
        source.path,
      )?.value ?? source.tokenEstimate?.value ?? null,
      inputCostPerInvocation: perInvocation?.value ?? source.configuredInputCost?.value ?? null,
      inputCostTotal: metric(report, "harness.source.input_cost_total", source.path)?.value ?? null,
      costUnit: perInvocation?.unit ?? source.configuredInputCost?.unit ?? null,
      costReference: perInvocation?.reference ?? source.configuredInputCost?.reference ?? null,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      errors: findings.filter((finding) => finding.severity === "error").length,
      findings: findings.filter((finding) => finding.severity !== "pass").length,
      effectiveness: null,
    };
  });
}

export function aggregateMetric(report: AnalysisReport, name: string): number | null {
  return metric(report, name)?.value ?? null;
}

export function snapshot(report: AnalysisReport, recordedAt = new Date().toISOString()): HistorySnapshot {
  return {
    recordedAt,
    complete: report.completeness.complete,
    files: report.sources.length,
    estimatedTokens: aggregateMetric(report, "harness.total_estimated_tokens"),
    warnings: report.findings.filter((finding) => finding.severity === "warning").length,
    errors: report.findings.filter((finding) => finding.severity === "error").length,
    qualityMean: report.score_summary.quality_mean,
  };
}

export function appendSnapshot(
  history: readonly HistorySnapshot[],
  next: HistorySnapshot,
): HistorySnapshot[] {
  return [...history, next].slice(-100);
}

export function classifyTrend(history: readonly HistorySnapshot[]): Trend {
  const complete = history.filter((entry) => entry.complete);
  const current = complete.at(-1);
  const baseline = complete.at(-2);
  if (!current || !baseline) {
    return {
      state: "insufficient_evidence",
      reason: "Two complete snapshots required.",
      method: "deterministic_snapshot_delta",
    };
  }

  const errors = current.errors - baseline.errors;
  const warnings = current.warnings - baseline.warnings;
  const quality = current.qualityMean !== null && baseline.qualityMean !== null
    ? current.qualityMean - baseline.qualityMean
    : 0;
  if (errors > 0 || warnings > 0 || quality < 0) {
    return {
      state: "degrading",
      reason: `Errors ${signed(errors)}, warnings ${signed(warnings)}, quality ${signed(quality)}.`,
      method: "deterministic_snapshot_delta",
    };
  }
  if (errors < 0 || warnings < 0 || quality > 0) {
    return {
      state: "improving",
      reason: `Errors ${signed(errors)}, warnings ${signed(warnings)}, quality ${signed(quality)}.`,
      method: "deterministic_snapshot_delta",
    };
  }
  return {
    state: "stable",
    reason: "No change in errors, warnings, or aggregate quality.",
    method: "deterministic_snapshot_delta",
  };
}

function signed(value: number): string {
  return value > 0 ? `+${value.toFixed(3)}` : value.toFixed(3);
}
