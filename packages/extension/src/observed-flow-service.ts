// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

export const observedFlowMethod = "harnessLens/observedFlow";

const requestMaxNodes = 256;
const requestMaxEdges = 512;
const maximumNodes = 5_000;
const maximumEdges = 10_000;
const maximumHops = 100;
const maximumFilterValues = 64;

export type ObservedFlowMetricName =
  | "transitions"
  | "distinct_sessions"
  | "duration_micros"
  | "cost";
export type ObservationStatus = "success" | "error" | "timeout" | "cancelled";
export type ObservedFlowState =
  | "off"
  | "unavailable"
  | "loading"
  | "ready"
  | "partial"
  | "failed"
  | "invalid";
export type ObservedFlowIssue =
  | "invalid_mode"
  | "missing_snapshot_path"
  | "unsupported_mode"
  | "workspace_blocked"
  | "not_found"
  | "snapshot_too_large"
  | "read_failed"
  | "invalid_data";
export type GraphAvailability = "ready" | "empty" | "insufficient_evidence" | "unavailable";

export interface ObservedFlowFilters {
  root?: string;
  maxHops: number;
  windowStart?: string;
  windowEnd?: string;
  categories: readonly string[];
  statuses: readonly ObservationStatus[];
  minimumShare?: number;
  metric: ObservedFlowMetricName;
  costUnit?: string;
}

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspLocation {
  uri: string;
  range: { start: LspPosition; end: LspPosition };
}

export interface FlowProvenance {
  source: string;
  method: "deterministic" | "statistical";
  evidenceIds: readonly string[];
  totalEvidence: number;
  location?: LspLocation;
}

export interface ObservedFlowNode {
  id: string;
  logicalId: string;
  label: string;
  kind: "action";
  layer?: number;
  provenance: readonly FlowProvenance[];
}

export interface WeightedEdgeMetric {
  value: number;
  unit: string;
  denominator: number;
  share: number;
  sampleSize: number;
  window: { start: string; end: string };
}

export interface ObservedFlowEdge {
  id: string;
  source: string;
  target: string;
  relationship: "observed_transition";
  method: "statistical";
  metric: WeightedEdgeMetric;
  provenance: readonly FlowProvenance[];
}

export interface ObservedFlowResponse {
  schemaVersion: 1;
  rootUri: string;
  status: {
    state: ObservedFlowState;
    issue?: ObservedFlowIssue;
    generation: number;
    lastSuccess?: number;
    hasSnapshot: boolean;
    observations: number;
    sessions: number;
  };
  graph: {
    schemaVersion: 1;
    kind: "observed_flow";
    method: "statistical";
    availability: GraphAvailability;
    completeness: {
      complete: boolean;
      reasons: readonly { code: string; count?: number }[];
    };
    limits: { maxNodes: number; maxEdges: number; maxHops: number };
    filters: {
      root?: string;
      window?: { start: string; end: string };
      categories: readonly string[];
      statuses: readonly ObservationStatus[];
      minimumShare?: number;
      metricUnit: string;
    };
    nodes: readonly ObservedFlowNode[];
    edges: readonly ObservedFlowEdge[];
  };
}

export const defaultObservedFlowFilters: ObservedFlowFilters = Object.freeze({
  maxHops: 32,
  categories: Object.freeze([]),
  statuses: Object.freeze([]),
  metric: "transitions",
});

export type ObservedFlowRequest = (method: string, parameters: unknown) => Promise<unknown>;

export class ObservedFlowService {
  constructor(private readonly request: ObservedFlowRequest) {}

  async flow(rootUri: string, filters: ObservedFlowFilters): Promise<ObservedFlowResponse> {
    if (!isFileUri(rootUri)) {
      throw new Error("Observed-flow rootUri must use the file scheme.");
    }
    const normalized = normalizeObservedFlowFilters(filters);
    const parameters = {
      rootUri,
      ...(normalized.root === undefined ? {} : { root: normalized.root }),
      maxNodes: requestMaxNodes,
      maxEdges: requestMaxEdges,
      maxHops: normalized.maxHops,
      ...(normalized.windowStart === undefined ? {} : {
        windowStart: normalized.windowStart,
        windowEnd: normalized.windowEnd,
      }),
      categories: normalized.categories,
      statuses: normalized.statuses,
      ...(normalized.minimumShare === undefined
        ? {}
        : { minimumShare: normalized.minimumShare }),
      metric: normalized.metric,
      ...(normalized.costUnit === undefined ? {} : { costUnit: normalized.costUnit }),
    };
    const response = parseObservedFlow(await this.request(observedFlowMethod, parameters));
    if (response.rootUri !== rootUri) {
      throw new Error("Observed-flow response rootUri does not match request.");
    }
    return response;
  }
}

export function normalizeObservedFlowFilters(value: unknown): ObservedFlowFilters {
  const input = record(value, "observed-flow filters");
  const root = optionalBoundedText(input.root, "flow root", 512);
  const maxHops = input.maxHops === undefined
    ? defaultObservedFlowFilters.maxHops
    : boundedInteger(input.maxHops, "flow maxHops", 1, maximumHops);
  const windowStart = optionalBoundedText(input.windowStart, "flow windowStart", 512);
  const windowEnd = optionalBoundedText(input.windowEnd, "flow windowEnd", 512);
  if ((windowStart === undefined) !== (windowEnd === undefined)) {
    throw new Error("Observed-flow window start and end must be supplied together.");
  }
  const categories = uniqueBoundedTexts(input.categories, "flow categories");
  const statuses = choices(
    input.statuses,
    observationStatuses,
    "flow statuses",
  );
  const minimumShare = input.minimumShare === undefined || input.minimumShare === null
    ? undefined
    : unitInterval(input.minimumShare, "flow minimumShare");
  const metric = input.metric === undefined
    ? defaultObservedFlowFilters.metric
    : choice(input.metric, observedFlowMetrics, "flow metric");
  const costUnit = optionalBoundedText(input.costUnit, "flow costUnit", 64);
  if (metric === "cost" && costUnit === undefined) {
    throw new Error("Observed-flow cost metric requires costUnit.");
  }
  if (metric !== "cost" && costUnit !== undefined) {
    throw new Error("Observed-flow costUnit is valid only for cost metric.");
  }
  return {
    ...(root === undefined ? {} : { root }),
    maxHops,
    ...(windowStart === undefined ? {} : { windowStart, windowEnd: windowEnd! }),
    categories,
    statuses,
    ...(minimumShare === undefined ? {} : { minimumShare }),
    metric,
    ...(costUnit === undefined ? {} : { costUnit }),
  };
}

export function parseObservedFlow(value: unknown): ObservedFlowResponse {
  const response = record(value, "observed-flow response");
  const schemaVersion = protocolVersion(response.schemaVersion, "observed-flow schemaVersion");
  const rootUri = boundedText(response.rootUri, "observed-flow rootUri", 4096);
  if (!isFileUri(rootUri)) {
    throw new Error("Observed-flow response rootUri must use the file scheme.");
  }
  const statusValue = record(response.status, "observed-flow status");
  const statusState = choice(statusValue.state, observedFlowStates, "observed-flow state");
  const issue = optionalChoice(statusValue.issue, observedFlowIssues, "observed-flow issue");
  const lastSuccess = optionalNonNegativeInteger(
    statusValue.lastSuccess,
    "observed-flow lastSuccess",
  );
  const status = {
    state: statusState,
    ...(issue === undefined ? {} : { issue }),
    generation: nonNegativeInteger(statusValue.generation, "observed-flow generation"),
    ...(lastSuccess === undefined ? {} : { lastSuccess }),
    hasSnapshot: boolean(statusValue.hasSnapshot, "observed-flow hasSnapshot"),
    observations: nonNegativeInteger(statusValue.observations, "observed-flow observations"),
    sessions: nonNegativeInteger(statusValue.sessions, "observed-flow sessions"),
  };

  const graphValue = record(response.graph, "observed-flow graph");
  protocolVersion(graphValue.schema_version, "observed-flow graph schema_version");
  if (graphValue.kind !== "observed_flow" || graphValue.method !== "statistical") {
    throw new Error("Observed-flow graph must be statistical observed_flow evidence.");
  }
  const availability = choice(
    graphValue.availability,
    graphAvailabilities,
    "observed-flow availability",
  );
  const completenessValue = record(graphValue.completeness, "observed-flow completeness");
  const reasons = optionalList(completenessValue.reasons, "observed-flow reasons")
    .map((value) => {
      const reason = record(value, "observed-flow reason");
      const count = optionalPositiveInteger(reason.count, "observed-flow reason count");
      return {
        code: boundedText(reason.code, "observed-flow reason code", 128),
        ...(count === undefined ? {} : { count }),
      };
    });
  const complete = boolean(completenessValue.complete, "observed-flow complete");
  if (complete !== (reasons.length === 0)) {
    throw new Error("Observed-flow completeness and reasons disagree.");
  }

  const limitsValue = record(graphValue.limits, "observed-flow limits");
  const limits = {
    maxNodes: boundedInteger(limitsValue.max_nodes, "observed-flow max_nodes", 1, maximumNodes),
    maxEdges: boundedInteger(limitsValue.max_edges, "observed-flow max_edges", 1, maximumEdges),
    maxHops: boundedInteger(limitsValue.max_hops, "observed-flow max_hops", 1, maximumHops),
  };
  const filtersValue = record(graphValue.filters, "observed-flow graph filters");
  const filterRoot = optionalBoundedText(filtersValue.root, "observed-flow filter root", 512);
  const minimumShare = filtersValue.minimum_share === undefined
    || filtersValue.minimum_share === null
    ? undefined
    : unitInterval(filtersValue.minimum_share, "observed-flow minimum_share");
  const window = filtersValue.window === undefined || filtersValue.window === null
    ? undefined
    : parseWindow(filtersValue.window, "observed-flow filter window");
  const graphFilters = {
    ...(filterRoot === undefined ? {} : { root: filterRoot }),
    ...(window === undefined ? {} : { window }),
    categories: uniqueBoundedTexts(filtersValue.categories, "observed-flow filter categories"),
    statuses: choices(
      filtersValue.statuses,
      observationStatuses,
      "observed-flow filter statuses",
    ),
    ...(minimumShare === undefined ? {} : { minimumShare }),
    metricUnit: boundedText(filtersValue.metric_unit, "observed-flow metric_unit", 64),
  };

  const nodes = boundedList(graphValue.nodes, "observed-flow nodes", limits.maxNodes)
    .map(parseNode);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (nodeById.size !== nodes.length) {
    throw new Error("Observed-flow graph contains duplicate node identities.");
  }
  const edges = boundedList(graphValue.edges, "observed-flow edges", limits.maxEdges)
    .map(parseEdge);
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length) {
    throw new Error("Observed-flow graph contains duplicate edge identities.");
  }
  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
      throw new Error("Observed-flow edge references an unknown node.");
    }
    if (source.layer === undefined || target.layer === undefined || source.layer >= target.layer) {
      throw new Error("Observed-flow edges require forward layered node identities.");
    }
    if (edge.metric.unit !== graphFilters.metricUnit) {
      throw new Error("Observed-flow edge and graph metric units disagree.");
    }
  }
  const denominators = new Set(edges.map((edge) => edge.metric.denominator));
  if (denominators.size > 1) {
    throw new Error("Observed-flow edges must expose one filtered denominator.");
  }
  if (availability === "ready" && edges.length === 0) {
    throw new Error("Ready observed-flow graph requires measured edges.");
  }
  if (availability !== "ready" && edges.length !== 0) {
    throw new Error("Non-ready observed-flow graph cannot contain measured edges.");
  }
  if (availability === "ready" && !status.hasSnapshot) {
    throw new Error("Ready observed-flow graph requires an available snapshot.");
  }

  return {
    schemaVersion,
    rootUri,
    status,
    graph: {
      schemaVersion: 1,
      kind: "observed_flow",
      method: "statistical",
      availability,
      completeness: { complete, reasons },
      limits,
      filters: graphFilters,
      nodes,
      edges,
    },
  };
}

function parseNode(value: unknown): ObservedFlowNode {
  const node = record(value, "observed-flow node");
  if (node.kind !== "action") {
    throw new Error("Observed-flow node kind must be action.");
  }
  const layer = optionalNonNegativeInteger(node.layer, "observed-flow node layer");
  return {
    id: boundedText(node.id, "observed-flow node id", 512),
    logicalId: boundedText(node.logical_id, "observed-flow logical_id", 512),
    label: boundedText(node.label, "observed-flow node label", 512),
    kind: "action",
    ...(layer === undefined ? {} : { layer }),
    provenance: boundedList(node.provenance, "observed-flow node provenance", 32)
      .map((value) => parseProvenance(value, "deterministic", "node")),
  };
}

function parseEdge(value: unknown): ObservedFlowEdge {
  const edge = record(value, "observed-flow edge");
  if (edge.relationship !== "observed_transition" || edge.method !== "statistical") {
    throw new Error("Observed-flow edge must be a statistical observed_transition.");
  }
  const metric = record(edge.metric, "observed-flow edge metric");
  const valueNumber = nonNegativeFinite(metric.value, "observed-flow metric value");
  const denominator = positiveFinite(metric.denominator, "observed-flow denominator");
  const share = unitInterval(metric.share, "observed-flow share");
  if (Math.abs(valueNumber / denominator - share) > 1e-9) {
    throw new Error("Observed-flow metric share does not match value and denominator.");
  }
  return {
    id: boundedText(edge.id, "observed-flow edge id", 512),
    source: boundedText(edge.source, "observed-flow edge source", 512),
    target: boundedText(edge.target, "observed-flow edge target", 512),
    relationship: "observed_transition",
    method: "statistical",
    metric: {
      value: valueNumber,
      unit: boundedText(metric.unit, "observed-flow metric unit", 64),
      denominator,
      share,
      sampleSize: positiveInteger(metric.sample_size, "observed-flow sample_size"),
      window: parseWindow(metric.window, "observed-flow metric window"),
    },
    provenance: boundedList(edge.provenance, "observed-flow edge provenance", 32)
      .map((value) => parseProvenance(value, "statistical", "edge")),
  };
}

function parseProvenance(
  value: unknown,
  method: FlowProvenance["method"],
  owner: "node" | "edge",
): FlowProvenance {
  const provenance = record(value, "observed-flow provenance");
  if (provenance.method !== method) {
    throw new Error(`Observed-flow ${owner} provenance method must be ${method}.`);
  }
  const evidenceIds = uniqueBoundedTexts(
    provenance.evidence_ids,
    "observed-flow evidence_ids",
    32,
  );
  const totalEvidence = nonNegativeInteger(
    provenance.total_evidence,
    "observed-flow total_evidence",
  );
  if (totalEvidence < evidenceIds.length) {
    throw new Error("Observed-flow total evidence is smaller than bounded evidence IDs.");
  }
  const location = provenance.location === undefined || provenance.location === null
    ? undefined
    : parseLocation(provenance.location);
  return {
    source: boundedText(provenance.source, "observed-flow provenance source", 512),
    method,
    evidenceIds,
    totalEvidence,
    ...(location === undefined ? {} : { location }),
  };
}

function parseLocation(value: unknown): LspLocation {
  const location = record(value, "observed-flow location");
  const uri = boundedText(location.uri, "observed-flow location URI", 4096);
  if (!isFileUri(uri)) {
    throw new Error("Observed-flow navigation location must use the file scheme.");
  }
  const range = record(location.range, "observed-flow location range");
  const start = parsePosition(range.start, "observed-flow location start");
  const end = parsePosition(range.end, "observed-flow location end");
  if (end.line < start.line || (end.line === start.line && end.character < start.character)) {
    throw new Error("Observed-flow location range is reversed.");
  }
  return { uri, range: { start, end } };
}

function parsePosition(value: unknown, label: string): LspPosition {
  const position = record(value, label);
  return {
    line: nonNegativeInteger(position.line, `${label} line`),
    character: nonNegativeInteger(position.character, `${label} character`),
  };
}

function parseWindow(value: unknown, label: string): { start: string; end: string } {
  const window = record(value, label);
  return {
    start: boundedText(window.start, `${label} start`, 512),
    end: boundedText(window.end, `${label} end`, 512),
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalList(value: unknown, label: string): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return list(value, label);
}

function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function boundedList(value: unknown, label: string, maximum: number): unknown[] {
  const values = list(value, label);
  if (values.length > maximum) {
    throw new Error(`${label} exceeds ${maximum} entries.`);
  }
  return values;
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new Error(`${label} must be a non-empty string of at most ${maximum} characters.`);
  }
  return value;
}

function optionalBoundedText(value: unknown, label: string, maximum: number): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return boundedText(value, label, maximum).trim() || undefined;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function positiveFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return value;
}

function nonNegativeFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
  return value;
}

function unitInterval(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0.0 and 1.0.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  return boundedInteger(value, label, 0, Number.MAX_SAFE_INTEGER);
}

function positiveInteger(value: unknown, label: string): number {
  return boundedInteger(value, label, 1, Number.MAX_SAFE_INTEGER);
}

function optionalNonNegativeInteger(value: unknown, label: string): number | undefined {
  return value === undefined || value === null ? undefined : nonNegativeInteger(value, label);
}

function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  return value === undefined || value === null ? undefined : positiveInteger(value, label);
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function choice<const T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== "string" || !choices.includes(value as T)) {
    throw new Error(`Unsupported ${label}: ${String(value)}.`);
  }
  return value as T;
}

function optionalChoice<const T extends string>(
  value: unknown,
  choices: readonly T[],
  label: string,
): T | undefined {
  return value === undefined || value === null ? undefined : choice(value, choices, label);
}

function choices<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  const values = boundedList(value, label, maximumFilterValues)
    .map((entry) => choice(entry, allowed, label));
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicate values.`);
  }
  return [...values].sort();
}

function uniqueBoundedTexts(
  value: unknown,
  label: string,
  maximum = maximumFilterValues,
): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  const values = boundedList(value, label, maximum)
    .map((entry) => boundedText(entry, label, 512));
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicate values.`);
  }
  return [...values].sort();
}

function protocolVersion(value: unknown, label: string): 1 {
  if (value !== 1) {
    throw new Error(`Unsupported ${label}: ${String(value)}.`);
  }
  return 1;
}

function isFileUri(value: string): boolean {
  try {
    return new URL(value).protocol === "file:";
  } catch {
    return false;
  }
}

const observedFlowMetrics: readonly ObservedFlowMetricName[] = [
  "transitions",
  "distinct_sessions",
  "duration_micros",
  "cost",
];
const observationStatuses: readonly ObservationStatus[] = [
  "success",
  "error",
  "timeout",
  "cancelled",
];
const observedFlowStates: readonly ObservedFlowState[] = [
  "off",
  "unavailable",
  "loading",
  "ready",
  "partial",
  "failed",
  "invalid",
];
const observedFlowIssues: readonly ObservedFlowIssue[] = [
  "invalid_mode",
  "missing_snapshot_path",
  "unsupported_mode",
  "workspace_blocked",
  "not_found",
  "snapshot_too_large",
  "read_failed",
  "invalid_data",
];
const graphAvailabilities: readonly GraphAvailability[] = [
  "ready",
  "empty",
  "insufficient_evidence",
  "unavailable",
];
