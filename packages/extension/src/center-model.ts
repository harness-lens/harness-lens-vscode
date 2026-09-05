// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

export interface SourceRecord {
  path: string;
  kind: string;
  scope: string;
  bytes: number;
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
  findings: Finding[];
  metrics: Metric[];
  scores: Score[];
  score_summary: { quality_mean: number | null; safety_violations: number };
  plugin_executions: PluginExecution[];
}

export interface WorkspaceReports {
  schemaVersion: number;
  reports: AnalysisReport[];
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

function parseSource(value: unknown): SourceRecord {
  const source = object(value, "source");
  return {
    path: text(source.path, "source.path"),
    kind: text(source.kind, "source.kind"),
    scope: text(source.scope, "source.scope"),
    bytes: finite(source.bytes, "source.bytes"),
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
      )?.value ?? null,
      inputCostPerInvocation: perInvocation?.value ?? null,
      inputCostTotal: metric(report, "harness.source.input_cost_total", source.path)?.value ?? null,
      costUnit: perInvocation?.unit ?? null,
      costReference: perInvocation?.reference ?? null,
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
