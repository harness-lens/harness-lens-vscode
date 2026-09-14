// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import {
  aggregateMetric,
  assetSummaries,
  classifyTrend,
  type AnalysisReport,
  type HistorySnapshot,
  type RuntimeStatus,
} from "./center-model.js";
import {
  type FlowProvenance,
  type ObservedFlowEdge,
  type ObservedFlowFilters,
  type ObservedFlowNode,
  type ObservedFlowResponse,
  type ObservedFlowTurn,
} from "./observed-flow-service.js";

export interface CenterViewState {
  report?: AnalysisReport;
  history: HistorySnapshot[];
  runtime?: RuntimeStatus;
  flow?: ObservedFlowResponse;
  flowFilters: ObservedFlowFilters;
  flowError?: string;
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

interface PositionedFlowNode {
  node: ObservedFlowNode;
  x: number;
  y: number;
  height: number;
}

function firstLocation(provenance: readonly FlowProvenance[]): FlowProvenance["location"] {
  return provenance.find((value) => value.location)?.location;
}

function flowLocationFileName(
  location: FlowProvenance["location"],
): string | undefined {
  if (!location) {
    return undefined;
  }
  try {
    const segment = new URL(location.uri).pathname.split("/").filter(Boolean).at(-1);
    if (!segment) {
      return undefined;
    }
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  } catch {
    return undefined;
  }
}

function flowFileName(provenance: readonly FlowProvenance[]): string | undefined {
  return flowLocationFileName(firstLocation(provenance));
}

function flowLocationAttributes(location: FlowProvenance["location"]): string {
  return location
    ? ` data-flow-uri="${escapeHtml(location.uri)}" data-flow-line="${location.range.start.line}" data-flow-character="${location.range.start.character}"`
    : "";
}

function flowNavigationAttributes(provenance: readonly FlowProvenance[]): string {
  return flowLocationAttributes(firstLocation(provenance));
}

function flowProvenanceDetails(provenance: readonly FlowProvenance[]): string {
  if (provenance.length === 0) {
    return '<p class="muted">No bounded provenance references are available for this item.</p>';
  }
  const items = provenance.map((value) => `<li>
    <strong>${escapeHtml(value.source)}</strong>
    <span>${escapeHtml(value.method)} · ${value.totalEvidence} evidence reference(s)</span>
    ${value.location ? `<button type="button" class="link flow-open"${flowNavigationAttributes([value])}>Open evidence</button>` : ""}
  </li>`).join("");
  return `<ul class="flow-provenance">${items}</ul>`;
}

function flowDetail(
  selection: string,
  kind: "node" | "edge",
  title: string,
  details: readonly [string, string][],
  provenance: readonly FlowProvenance[],
): string {
  const rows = details.map(([term, description]) =>
    `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(description)}</dd></div>`
  ).join("");
  return `<template id="flow-detail-${selection}">
    <div class="flow-inspector-heading"><small>${kind === "node" ? "Action node" : "Observed transition"}</small><h3>${escapeHtml(title)}</h3></div>
    <dl>${rows}</dl>
    <h4>Provenance</h4>
    ${flowProvenanceDetails(provenance)}
  </template>`;
}

function sankeyChart(flow: ObservedFlowResponse): string {
  if (flow.graph.availability !== "ready" || flow.graph.edges.length === 0) {
    return "";
  }
  const layers = new Map<number, ObservedFlowNode[]>();
  for (const node of flow.graph.nodes) {
    const layer = node.layer ?? 0;
    const values = layers.get(layer) ?? [];
    values.push(node);
    layers.set(layer, values);
  }
  for (const values of layers.values()) {
    values.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
  }
  const maximumLayer = Math.max(0, ...layers.keys());
  const maximumLayerSize = Math.max(1, ...[...layers.values()].map((values) => values.length));
  const width = Math.max(760, (maximumLayer + 1) * 190);
  const height = Math.max(420, maximumLayerSize * 80 + 100);
  const horizontalMargin = 50;
  const verticalMargin = 38;
  const nodeWidth = 16;
  const nodePadding = 28;
  const nodeWeights = new Map<string, number>();
  for (const node of flow.graph.nodes) {
    const incoming = flow.graph.edges
      .filter((edge) => edge.target === node.id)
      .reduce((sum, edge) => sum + edge.metric.value, 0);
    const outgoing = flow.graph.edges
      .filter((edge) => edge.source === node.id)
      .reduce((sum, edge) => sum + edge.metric.value, 0);
    nodeWeights.set(node.id, Math.max(incoming, outgoing));
  }
  const scaleCandidates = [...layers.values()].map((nodes) => {
    const total = nodes.reduce((sum, node) => sum + (nodeWeights.get(node.id) ?? 0), 0);
    const available = height - verticalMargin * 2 - Math.max(0, nodes.length - 1) * nodePadding;
    return total > 0 ? available / total : Number.POSITIVE_INFINITY;
  });
  const maximumWeight = Math.max(1, ...nodeWeights.values());
  const scale = Math.min(...scaleCandidates, 52 / maximumWeight);
  const positioned = new Map<string, PositionedFlowNode>();
  for (const [layer, nodes] of layers) {
    const nodeHeights = nodes.map((node) => (nodeWeights.get(node.id) ?? 0) * scale);
    const totalHeight = nodeHeights.reduce((sum, value) => sum + value, 0)
      + Math.max(0, nodes.length - 1) * nodePadding;
    let y = Math.max(verticalMargin, (height - totalHeight) / 2);
    for (const [index, node] of nodes.entries()) {
      const x = maximumLayer === 0
        ? width / 2
        : horizontalMargin
          + layer * (width - horizontalMargin * 2 - nodeWidth) / maximumLayer;
      const nodeHeight = nodeHeights[index] ?? 0;
      positioned.set(node.id, { node, x, y, height: nodeHeight });
      y += nodeHeight + nodePadding;
    }
  }

  const sourceOffsets = new Map<string, number>();
  const targetOffsets = new Map<string, number>();
  const detailTemplates: string[] = [];
  const edges = flow.graph.edges.map((edge, index) => {
    const source = positioned.get(edge.source)!;
    const target = positioned.get(edge.target)!;
    const thickness = edge.metric.value * scale;
    const sourceOffset = sourceOffsets.get(edge.source) ?? 0;
    const targetOffset = targetOffsets.get(edge.target) ?? 0;
    sourceOffsets.set(edge.source, sourceOffset + thickness);
    targetOffsets.set(edge.target, targetOffset + thickness);
    const sourceX = source.x + nodeWidth;
    const targetX = target.x;
    const sourceY = source.y + sourceOffset + thickness / 2;
    const targetY = target.y + targetOffset + thickness / 2;
    const bend = (targetX - sourceX) / 2;
    const label = `${source.node.label} to ${target.node.label}: ${edge.metric.value} ${edge.metric.unit} out of denominator ${edge.metric.denominator}; ${(edge.metric.share * 100).toFixed(1)} percent; ${edge.metric.sampleSize} samples; window ${edge.metric.window.start} through ${edge.metric.window.end}`;
    const selection = `edge-${index}`;
    detailTemplates.push(flowDetail(selection, "edge", `${source.node.label} → ${target.node.label}`, [
      ["Measured value", `${amount(edge.metric.value, 6)} ${edge.metric.unit}`],
      ["Filtered denominator", `${amount(edge.metric.denominator, 6)} ${edge.metric.unit}`],
      ["Share", percentage(edge.metric.share)],
      ["Sample size", String(edge.metric.sampleSize)],
      ["Observation window", `${edge.metric.window.start} through ${edge.metric.window.end}`],
      ["Method", edge.method],
    ], edge.provenance));
    return `<path class="flow-edge selectable" d="M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}" stroke-width="${thickness}" tabindex="0" role="button" aria-pressed="false" aria-controls="flow-inspector-content" aria-label="${escapeHtml(`${label}. Select for details.`)}" data-flow-selection="${selection}"${flowNavigationAttributes(edge.provenance)}><title>${escapeHtml(label)}</title></path>`;
  }).join("");
  const nodes = [...positioned.values()].map(({ node, x, y, height: nodeHeight }, index) => {
    const fileName = flowFileName(node.provenance);
    const label = `${node.label}; canonical identity ${node.logicalId}; layer ${node.layer ?? 0}${fileName ? `; evidence file ${fileName}` : ""}`;
    const incoming = flow.graph.edges.filter((edge) => edge.target === node.id);
    const outgoing = flow.graph.edges.filter((edge) => edge.source === node.id);
    const selection = `node-${index}`;
    detailTemplates.push(flowDetail(selection, "node", node.label, [
      ["Canonical identity", node.logicalId],
      ["Sequence layer", String(node.layer ?? 0)],
      ...(fileName ? [["Evidence file", fileName] as [string, string]] : []),
      ["Incoming transitions", `${incoming.length} · ${amount(incoming.reduce((sum, edge) => sum + edge.metric.value, 0), 6)} ${flow.graph.filters.metricUnit}`],
      ["Outgoing transitions", `${outgoing.length} · ${amount(outgoing.reduce((sum, edge) => sum + edge.metric.value, 0), 6)} ${flow.graph.filters.metricUnit}`],
    ], node.provenance));
    const textX = x + nodeWidth + 6;
    const textY = y + Math.max(12, nodeHeight / 2) - (fileName ? 7 : 0);
    return `<g class="flow-node selectable" tabindex="0" role="button" aria-pressed="false" aria-controls="flow-inspector-content" aria-label="${escapeHtml(`${label}. Select for details.`)}" data-flow-selection="${selection}" data-flow-layer="${node.layer ?? 0}" data-flow-logical="${escapeHtml(node.logicalId)}"${flowNavigationAttributes(node.provenance)}>
      <rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}"><title>${escapeHtml(label)}</title></rect>
      <text><tspan x="${textX}" y="${textY}">${escapeHtml(node.label)} · L${node.layer ?? 0}</tspan>${fileName ? `<tspan class="flow-node-file" x="${textX}" dy="14">${escapeHtml(fileName)}</tspan>` : ""}</text>
    </g>`;
  }).join("");
  const denominator = flow.graph.edges[0]!.metric.denominator;
  const unit = flow.graph.filters.metricUnit;
  return `<div class="flow-chart-layout">
    <div class="flow-chart-scroll"><svg class="flow-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="flow-chart-title flow-chart-description">
      <title id="flow-chart-title">Observed ordered harness flow</title>
      <desc id="flow-chart-description">Link thickness is proportional to ${escapeHtml(unit)}. Filtered denominator ${denominator}. Cycles repeat canonical actions at later layers. Select a node or transition to inspect it beside the chart.</desc>
      <g class="flow-edges">${edges}</g><g class="flow-nodes">${nodes}</g>
    </svg></div>
    <aside id="flow-inspector" class="flow-inspector" aria-label="Selected observed-flow details">
      <div id="flow-inspector-content" aria-live="polite"><div class="empty"><strong>Select a flow item</strong><p>Choose a node or transition in the Sankey to inspect its bounded metrics and provenance.</p></div></div>
      ${detailTemplates.join("")}
    </aside>
  </div>`;
}

function tokenComponent(value: number | undefined): string {
  return value === undefined ? "Not supplied" : `${amount(value, 0)} tokens`;
}

function tokenTurnDetail(
  turn: ObservedFlowTurn,
  index: number,
  total: number,
): string {
  const usage = turn.tokenUsage;
  const fileName = flowLocationFileName(turn.location);
  const rows: readonly [string, string][] = [
    ["Turn", `${index + 1} of ${total}`],
    ["Action", `${turn.action.label} · L${turn.layer}`],
    ["Session / sequence", `${turn.sessionId} / ${turn.sequence}`],
    ["Status", turn.status],
    ["Total tokens", usage ? tokenComponent(usage.totalTokens) : "Not supplied"],
    ["Input tokens", tokenComponent(usage?.inputTokens)],
    ["Output tokens", tokenComponent(usage?.outputTokens)],
    ["Cached input", tokenComponent(usage?.cachedInputTokens)],
    ["Evidence", usage ? (usage.estimated ? "Explicitly estimated" : "Measured") : "Unavailable"],
    ["Attributed cost", turn.cost
      ? `${amount(turn.cost.value, 6)} ${turn.cost.unit} · ${turn.cost.estimated ? "estimated" : "measured"}`
      : "Not supplied"],
    ...(turn.observedAt ? [["Observed at", turn.observedAt] as [string, string]] : []),
    ...(fileName ? [["Evidence file", fileName] as [string, string]] : []),
  ];
  const details = rows.map(([term, description]) =>
    `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(description)}</dd></div>`
  ).join("");
  return `<div class="token-turn-detail-content">
    <div class="token-turn-heading"><small>${escapeHtml(turn.action.category)} · ${escapeHtml(turn.status)}</small><h4>${escapeHtml(turn.action.label)} · L${turn.layer}</h4></div>
    <dl>${details}</dl>
    ${turn.location ? `<button type="button" class="link token-open"${flowLocationAttributes(turn.location)}>Open turn evidence</button>` : ""}
  </div>`;
}

function tokenLens(flow: ObservedFlowResponse): string {
  const timeline = flow.tokenTimeline;
  const completeness = timeline.completeness.complete
    ? "Complete token evidence"
    : `Partial token evidence: ${timeline.completeness.reasons.map((reason) => `${reason.code}${reason.count === undefined ? "" : ` (${reason.count})`}`).join(", ")}`;
  if (timeline.turns.length === 0) {
    return `<div id="token-lens" class="token-lens">
      <div class="token-lens-heading"><div><h3>Turn token lens</h3><p>Token consumption along the selected observed flow.</p></div><span>${timeline.sampleSize} samples</span></div>
      <div class="empty" role="status"><strong>Per-turn token evidence ${escapeHtml(timeline.availability)}</strong><p>No returned turn carries a token measurement. Missing evidence never means zero consumption.</p><p>${escapeHtml(completeness)}</p></div>
    </div>`;
  }

  const maximum = Math.max(
    1,
    ...timeline.turns.map((turn) => turn.tokenUsage?.totalTokens ?? 0),
  );
  const baseline = 126;
  const maximumBarHeight = 94;
  const barWidth = 20;
  const barStep = 34;
  const chartWidth = Math.max(760, timeline.turns.length * barStep + 42);
  const sessionBreaks: string[] = [];
  const bars = timeline.turns.map((turn, index) => {
    const x = 28 + index * barStep;
    if (index > 0 && timeline.turns[index - 1]!.sessionId !== turn.sessionId) {
      sessionBreaks.push(`<line class="token-session-break" x1="${x - 7}" y1="18" x2="${x - 7}" y2="${baseline + 3}"><title>Session boundary</title></line>`);
    }
    const usage = turn.tokenUsage;
    const totalHeight = usage
      ? Math.max(3, usage.totalTokens / maximum * maximumBarHeight)
      : 0;
    const inputHeight = usage && usage.totalTokens > 0 && usage.inputTokens !== undefined
      ? totalHeight * usage.inputTokens / usage.totalTokens
      : 0;
    const outputHeight = usage && usage.totalTokens > 0 && usage.outputTokens !== undefined
      ? totalHeight * usage.outputTokens / usage.totalTokens
      : 0;
    const cachedHeight = usage && usage.totalTokens > 0 && usage.cachedInputTokens !== undefined
      ? totalHeight * usage.cachedInputTokens / usage.totalTokens
      : 0;
    const componentsKnown = usage?.inputTokens !== undefined && usage.outputTokens !== undefined;
    const shapes = !usage
      ? `<line class="token-gap" x1="${x}" y1="${baseline - 12}" x2="${x + barWidth}" y2="${baseline - 12}" />`
      : componentsKnown
        ? `<rect class="token-input" x="${x}" y="${baseline - inputHeight}" width="${barWidth}" height="${inputHeight}" /><rect class="token-output" x="${x}" y="${baseline - totalHeight}" width="${barWidth}" height="${outputHeight}" />${cachedHeight > 0 ? `<rect class="token-cached" x="${x}" y="${baseline - cachedHeight}" width="${barWidth}" height="${cachedHeight}" />` : ""}`
        : `<rect class="token-total" x="${x}" y="${baseline - totalHeight}" width="${barWidth}" height="${totalHeight}" />`;
    const label = usage
      ? `Turn ${index + 1}, ${turn.action.label}, ${usage.totalTokens} tokens${usage.estimated ? ", estimated" : ", measured"}`
      : `Turn ${index + 1}, ${turn.action.label}, token evidence unavailable`;
    return `<g class="token-bar selectable" tabindex="0" role="button" aria-pressed="false" aria-controls="token-turn-detail" aria-label="${escapeHtml(`${label}. Select this turn.`)}" data-token-index="${index}" data-token-layer="${turn.layer}" data-token-action="${escapeHtml(turn.action.id)}">
      <rect class="token-hit-area" x="${x - 4}" y="18" width="${barWidth + 8}" height="${baseline - 12}" />${shapes}<text class="token-axis-label" x="${x + barWidth / 2}" y="148" text-anchor="middle">${index + 1}</text><title>${escapeHtml(label)}</title>
    </g>`;
  }).join("");
  const templates = timeline.turns.map((turn, index) =>
    `<template id="token-detail-${index}">${tokenTurnDetail(turn, index, timeline.turns.length)}</template>`
  ).join("");
  return `<div id="token-lens" class="token-lens" data-token-turns="${timeline.turns.length}">
    <div class="token-lens-heading"><div><h3>Turn token lens</h3><p>Slide across turns to compare token consumption while actions load files and produce output.</p></div><span>${timeline.sampleSize} of ${timeline.turns.length} returned turns · ${timeline.method}</span></div>
    <div class="token-legend" aria-label="Token bar legend"><span class="input">Input</span><span class="output">Output</span><span class="cached">Cached input subset</span><span class="gap">Unavailable</span></div>
    <div class="token-lens-layout">
      <div class="token-visualization">
        <div class="token-chart-scroll"><svg id="token-chart" class="token-chart" viewBox="0 0 ${chartWidth} 160" width="${chartWidth}" height="160" role="img" aria-labelledby="token-chart-title token-chart-description"><title id="token-chart-title">Token consumption by observed turn</title><desc id="token-chart-description">Stacked input and output token bars. Cached input is marked within input. Dashed markers are missing evidence, not zero.</desc><line class="token-baseline" x1="18" y1="${baseline}" x2="${chartWidth - 12}" y2="${baseline}" />${sessionBreaks.join("")}${bars}</svg></div>
        <label class="token-slider-label" for="token-turn-slider"><span>Observed turn</span><input id="token-turn-slider" type="range" min="0" max="${timeline.turns.length - 1}" value="0" step="1" aria-controls="token-chart token-turn-detail"><output id="token-turn-position" for="token-turn-slider">1 of ${timeline.turns.length}</output></label>
      </div>
      <aside id="token-turn-detail" class="token-turn-detail" aria-live="polite">${tokenTurnDetail(timeline.turns[0]!, 0, timeline.turns.length)}</aside>
    </div>
    <p class="method">${escapeHtml(completeness)}. Sample size ${timeline.sampleSize}; showing ${timeline.turns.length} of ${timeline.totalTurns} matching turns. Bar height uses measured or explicitly estimated total tokens.</p>
    ${templates}
  </div>`;
}

function selected(value: string, expected: string): string {
  return value === expected ? " selected" : "";
}

function checked(values: readonly string[], expected: string): string {
  return values.includes(expected) ? " checked" : "";
}

function flowStateMessage(flow: ObservedFlowResponse): string {
  switch (flow.graph.availability) {
    case "unavailable":
      return "Observed flow is unavailable. This is missing evidence, not zero activity.";
    case "insufficient_evidence":
      return "Evidence exists, but it cannot establish an ordered transition.";
    case "empty":
      return "Complete evidence contains no transitions matching the active filters.";
    case "ready":
      return `${flow.graph.edges.length} measured transition(s) across ${flow.graph.nodes.length} layered node(s).`;
  }
}

function observedFlowSection(
  flow: ObservedFlowResponse | undefined,
  filters: ObservedFlowFilters,
  error: string | undefined,
): string {
  const rootOptions = flow
    ? [...new Map(flow.graph.nodes.map((node) => [node.logicalId, node.label])).entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`)
      .join("")
    : "";
  const filterForm = `<form id="flow-filters">
    <fieldset><legend>Observed-flow projection</legend><div class="flow-filter-grid">
      <label>Root action<input name="root" list="flow-roots" value="${escapeHtml(filters.root ?? "")}" placeholder="All actions"></label><datalist id="flow-roots">${rootOptions}</datalist>
      <label>Maximum hops<input name="maxHops" type="number" min="1" max="100" value="${filters.maxHops}"></label>
      <label>Window start<input name="windowStart" value="${escapeHtml(filters.windowStart ?? "")}" placeholder="ISO timestamp"></label>
      <label>Window end<input name="windowEnd" value="${escapeHtml(filters.windowEnd ?? "")}" placeholder="ISO timestamp"></label>
      <label>Categories<input name="categories" value="${escapeHtml(filters.categories.join(", "))}" placeholder="tool, model"></label>
      <label>Minimum share<input name="minimumShare" type="number" min="0" max="1" step="0.001" value="${filters.minimumShare ?? ""}" placeholder="0.01"></label>
      <label>Width metric<select name="metric"><option value="transitions"${selected(filters.metric, "transitions")}>Transitions</option><option value="distinct_sessions"${selected(filters.metric, "distinct_sessions")}>Distinct sessions</option><option value="duration_micros"${selected(filters.metric, "duration_micros")}>Duration</option><option value="cost"${selected(filters.metric, "cost")}>Observed cost</option></select></label>
      <label>Cost unit<input name="costUnit" value="${escapeHtml(filters.costUnit ?? "")}" placeholder="USD"></label>
    </div><div class="flow-statuses" role="group" aria-label="Destination statuses">
      <span>Destination status</span>
      <label><input type="checkbox" name="status" value="success"${checked(filters.statuses, "success")}> Success</label>
      <label><input type="checkbox" name="status" value="error"${checked(filters.statuses, "error")}> Error</label>
      <label><input type="checkbox" name="status" value="timeout"${checked(filters.statuses, "timeout")}> Timeout</label>
      <label><input type="checkbox" name="status" value="cancelled"${checked(filters.statuses, "cancelled")}> Cancelled</label>
    </div><div class="runtime-actions"><button type="submit">Apply flow filters</button><button type="button" id="refresh-flow">Refresh trace snapshot</button><button type="button" id="flow-settings">Configure trace source</button></div></fieldset>
  </form>`;
  if (!flow) {
    return `<section id="flow"><h2>Observed flow</h2><p>Only measured, ordered action transitions appear here. Static relationships remain in the workspace tree.</p>${filterForm}<div class="empty" role="status"><strong>Observed flow unavailable</strong><p>${escapeHtml(error ?? "Use a compatible language server and configure an explicit sanitized trace source.")}</p><p>Unavailable evidence never means zero activity.</p></div></section>`;
  }
  const nodeById = new Map(flow.graph.nodes.map((node) => [node.id, node]));
  const completeness = flow.graph.completeness.complete
    ? "Complete"
    : `Partial: ${flow.graph.completeness.reasons.map((reason) => `${reason.code}${reason.count === undefined ? "" : ` (${reason.count})`}`).join(", ")}`;
  const activeFilters = [
    flow.graph.filters.root ? `root ${flow.graph.filters.root}` : "all roots",
    `max ${flow.graph.limits.maxHops} hops`,
    flow.graph.filters.window
      ? `window ${flow.graph.filters.window.start} through ${flow.graph.filters.window.end}`
      : "full trace window",
    flow.graph.filters.categories.length
      ? `categories ${flow.graph.filters.categories.join(", ")}`
      : "all categories",
    flow.graph.filters.statuses.length
      ? `statuses ${flow.graph.filters.statuses.join(", ")}`
      : "all statuses",
    flow.graph.filters.minimumShare === undefined
      ? "no minimum share"
      : `minimum share ${flow.graph.filters.minimumShare}`,
  ].join(" · ");
  const rows = flow.graph.edges.map((edge) => {
    const source = nodeById.get(edge.source)!;
    const target = nodeById.get(edge.target)!;
    const provenance = edge.provenance
      .map((value) => `${value.source}: ${value.totalEvidence} evidence reference(s)`)
      .join("; ");
    const location = firstLocation(edge.provenance);
    return `<tr>
      <td>${escapeHtml(source.label)} <small>${escapeHtml(source.logicalId)} · layer ${source.layer ?? "—"}</small></td>
      <td>${escapeHtml(target.label)} <small>${escapeHtml(target.logicalId)} · layer ${target.layer ?? "—"}</small></td>
      <td>${amount(edge.metric.value, 6)} ${escapeHtml(edge.metric.unit)}</td>
      <td>${amount(edge.metric.denominator, 6)} ${escapeHtml(edge.metric.unit)}</td>
      <td>${percentage(edge.metric.share)}</td>
      <td>${edge.metric.sampleSize}</td>
      <td>${escapeHtml(edge.metric.window.start)}<small>through ${escapeHtml(edge.metric.window.end)}</small></td>
      <td>${escapeHtml(provenance)}${location ? `<button class="link flow-open"${flowNavigationAttributes(edge.provenance)}>Open evidence</button>` : ""}</td>
    </tr>`;
  }).join("");
  const stale = flow.status.state === "failed" && flow.status.hasSnapshot
    ? " Previous validated snapshot retained; graph is stale."
    : "";
  return `<section id="flow">
    <div class="section-title"><div><h2>Observed flow</h2><p>Measured adjacent transitions only. Static relationships and possible paths are never shown as observed flow.</p></div><span class="flow-state">${escapeHtml(flow.status.state)} / ${escapeHtml(flow.graph.availability)}</span></div>
    ${filterForm}
    ${error ? `<div role="alert"><strong>Flow refresh failed. Previous validated projection retained.</strong><p>${escapeHtml(error)}</p></div>` : ""}
    <div class="flow-summary" role="status" aria-live="polite"><strong>${escapeHtml(flowStateMessage(flow))}</strong><p>${escapeHtml(completeness)}.${escapeHtml(stale)}</p><p>Metric: ${escapeHtml(flow.graph.filters.metricUnit)} · ${flow.status.observations} observations · ${flow.status.sessions} sessions · generation ${flow.status.generation}${flow.status.issue ? ` · issue ${escapeHtml(flow.status.issue)}` : ""}</p><p>Active filters: ${escapeHtml(activeFilters)}</p></div>
    ${sankeyChart(flow)}
    ${tokenLens(flow)}
    ${rows ? `<div class="scroll"><table class="flow-table"><caption>Keyboard-accessible observed transition data. Link thickness above is proportional to the same named value and denominator.</caption><thead><tr><th>Source</th><th>Target</th><th>Measured value</th><th>Filtered denominator</th><th>Share</th><th>Sample</th><th>Window</th><th>Provenance</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
    <p class="method">Method: statistical aggregation of originally adjacent sanitized observations. Layered copies preserve canonical logical identity when cycles recur.</p>
  </section>`;
}

function reportBody(
  report: AnalysisReport,
  history: readonly HistorySnapshot[],
  runtime: RuntimeStatus | undefined,
  flow: ObservedFlowResponse | undefined,
  flowFilters: ObservedFlowFilters,
  flowError: string | undefined,
): string {
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
  const runtimeStatus = runtime ?? {
    mode: "off",
    state: "off",
    period: "",
    calls: 0,
    sessions: 0,
    warningCount: 0,
    hasSnapshot: false,
  } satisfies RuntimeStatus;
  const runtimeTitle = runtimeStatus.state === "ready"
    ? `${amount(runtimeStatus.calls, 0)} calls · ${amount(runtimeStatus.sessions, 0)} sessions`
    : runtimeStatus.state === "off"
      ? "Off"
      : runtimeStatus.hasSnapshot
        ? `${runtimeStatus.state}; previous snapshot retained`
        : runtimeStatus.state;
  const runtimeDetail = runtimeStatus.issue
    ? `Stable error class: ${runtimeStatus.issue}`
    : runtimeStatus.mode === "off"
      ? "Enable live or snapshot mode explicitly to load aggregate evidence."
      : `Mode ${runtimeStatus.mode} · period ${runtimeStatus.period || "not supplied"} · ${runtimeStatus.warningCount} warning(s)`;

  const assetRows = assets.map((asset) => `<tr data-asset>
    <td><button class="link" data-open="${escapeHtml(asset.path)}">${escapeHtml(asset.path)}</button><small>${escapeHtml(asset.kind)} · scope ${escapeHtml(asset.scope)} · depth ${asset.inclusionDepth ?? "not supplied"} · ${asset.provenance.length} provenance link(s)</small></td>
    <td>${amount(asset.bytes, 0)}<small>${asset.characters ?? "—"} characters · ${asset.lines ?? "—"} lines</small></td>
    <td>${amount(asset.estimatedTokens, 0)}<small>${asset.tokenEstimate ? `${escapeHtml(asset.tokenEstimate.method)} · ${escapeHtml(asset.tokenEstimate.tokenizer)} · ${escapeHtml(asset.tokenEstimate.basis)}` : "heuristic · Unicode scalar count / 4"}</small></td>
    <td>${amount(asset.inputCostPerInvocation, 6)} ${escapeHtml(asset.costUnit ?? "")}<small>${asset.costReference ? escapeHtml(asset.costReference) : "No pricing reference"}</small></td>
    <td>${amount(asset.inputCostTotal, 6)} ${escapeHtml(asset.costUnit ?? "")}</td>
    <td>${asset.errors} error · ${asset.warnings} warning</td>
    <td><span class="unknown">Not measured</span><small>Requires attributed runtime outcomes</small></td>
  </tr>`).join("");

  const findingRows = report.findings
    .filter((finding) => finding.severity !== "pass")
    .map((finding) => `<tr data-finding-row>
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

  const historyRows = [...history].reverse().map((entry) => `<tr data-history-row>
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
    <article><small>Runtime aggregate</small><strong>${escapeHtml(runtimeTitle)}</strong><small>${escapeHtml(runtimeDetail)}</small></article>
  </div>

  <section id="overview">
    <div class="section-title"><div><h2>Change direction</h2><p>${escapeHtml(trend.reason)}</p></div><span class="trend-state ${trend.state}">${escapeHtml(trend.state.replace("_", " "))}</span></div>
    ${historyChart(history)}
    <p class="method">Method: deterministic snapshot delta. Any increased error/warning count or reduced aggregate quality means degrading. Only complete reports participate.</p>
  </section>

  <section id="files">
    <h2>Files and instructions</h2>
    <p>Per-file cost and quality evidence. Effectiveness remains unmeasured until runtime outcomes can be attributed to an exact asset.</p>
    <label class="filter">Filter files <input id="file-filter" type="search" placeholder="File path or kind" /></label>
    <p id="file-filter-status" role="status" aria-live="polite"></p>
    <div class="scroll"><table><thead><tr><th>File</th><th>Bytes</th><th>Context</th><th>Input cost / invocation</th><th>Configured total cost</th><th>Findings</th><th>Effectiveness</th></tr></thead><tbody>${assetRows || '<tr><td colspan="7">No harness files found.</td></tr>'}</tbody></table></div>
  </section>

  <section id="findings" data-findings-page-size="10">
    <h2>Findings</h2>
    <p>Warnings and errors are shown ten at a time. Pagination does not change deterministic finding counts.</p>
    <div class="scroll"><table><thead><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Evidence</th></tr></thead><tbody>${findingRows}<tr id="findings-no-results" hidden><td colspan="4">No warning or error findings.</td></tr></tbody></table></div>
    <nav class="table-pagination findings-pagination" aria-label="Finding pages">
      <button type="button" id="findings-previous">Previous</button>
      <span id="findings-page-status" role="status" aria-live="polite"></span>
      <button type="button" id="findings-next">Next</button>
    </nav>
  </section>

  <section id="scores">
    <h2>Scores and methods</h2>
    <div class="scroll"><table><thead><tr><th>Score</th><th>Value</th><th>Threshold</th><th>Method</th><th>Sample</th><th>State</th></tr></thead><tbody>${scoreRows}</tbody></table></div>
  </section>

  <section id="runtime">
    <h2>Runtime history</h2>
    <div class="runtime-actions"><button id="runtime-settings">Configure runtime evidence</button><button id="refresh-runtime">Refresh runtime evidence</button></div>
    <div class="empty"><strong>${escapeHtml(runtimeTitle)}</strong><p>${escapeHtml(runtimeDetail)}</p><p>Aggregate CodeBurn evidence never alters deterministic findings or scores. Sanitized ordered action evidence is shown separately as observed flow.</p></div>
  </section>

  ${observedFlowSection(flow, flowFilters, flowError)}

  <section id="plugins">
    <h2>Plugin execution</h2>
    <div class="scroll"><table><thead><tr><th>Plugin</th><th>Status</th><th>Duration</th><th>Detail</th></tr></thead><tbody>${pluginRows}</tbody></table></div>
  </section>

  <section id="history" data-history-page-size="10">
    <h2>Local history</h2>
    <p>Content-free summaries only. Maximum 100 snapshots per workspace.</p>
    <div class="history-toolbar">
      <label class="history-search">Search history <input id="history-search" type="search" placeholder="Date, coverage, or metric" /></label>
      <span id="history-filter-status" role="status" aria-live="polite"></span>
    </div>
    <div class="scroll"><table><thead><tr><th>Recorded</th><th>Coverage</th><th>Files</th><th>Tokens</th><th>Errors</th><th>Warnings</th><th>Quality</th></tr></thead><tbody>${historyRows}<tr id="history-no-results" hidden><td colspan="7">No local snapshots recorded.</td></tr></tbody></table></div>
    <nav class="table-pagination history-pagination" aria-label="Local history pages">
      <button type="button" id="history-previous">Previous</button>
      <span id="history-page-status" role="status" aria-live="polite"></span>
      <button type="button" id="history-next">Next</button>
    </nav>
  </section>`;
}

export function centerHtml(state: CenterViewState, nonce: string): string {
  const staleWarning = state.report && state.error
    ? `<section role="alert"><strong>Refresh failed. Previous report retained.</strong><p>${escapeHtml(state.error)}</p></section>`
    : "";
  const body = state.report
    ? reportBody(
        state.report,
        state.history,
        state.runtime,
        state.flow,
        state.flowFilters,
        state.flowError,
      )
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
  nav { display: flex; flex-wrap: wrap; gap: 14px; padding: 12px 24px; border-bottom: 1px solid var(--vscode-panel-border); }
  nav a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  nav a:hover { text-decoration: underline; }
  section { scroll-margin-top: 90px; }
  .filter { display: flex; align-items: center; gap: 10px; margin: 12px 0; }
  input, select { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); padding: 7px; min-width: 180px; }
  :focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .runtime-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
  fieldset { border: 1px solid var(--vscode-panel-border); margin: 14px 0; padding: 12px; }
  .flow-filter-grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .flow-filter-grid label { display: flex; flex: 1 1 190px; flex-direction: column; gap: 4px; min-width: 0; }
  .flow-statuses { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
  .flow-statuses label { align-items: center; display: flex; gap: 4px; }
  .flow-statuses input { min-width: 0; }
  .flow-state { border: 1px solid currentColor; font-weight: 600; padding: 3px 8px; text-transform: uppercase; }
  .flow-summary { border-left: 4px solid var(--vscode-focusBorder); margin: 14px 0; padding: 10px 12px; }
  .flow-summary p { margin: 4px 0; }
  .flow-chart-layout { align-items: stretch; display: flex; flex-wrap: nowrap; gap: 12px; min-width: 0; }
  .flow-chart-scroll { align-items: center; border: 1px solid var(--vscode-panel-border); display: flex; flex: 1 1 620px; min-height: 420px; min-width: 0; overflow: auto; transition: flex-basis 180ms ease, min-height 180ms ease; }
  .flow-chart { background: var(--vscode-editor-background); display: block; flex: 0 0 auto; margin: auto; }
  .flow-edge { fill: none; opacity: .55; stroke: var(--vscode-charts-blue); }
  .selectable { cursor: pointer; }
  .flow-edge:focus, .flow-edge:hover { opacity: 1; stroke: var(--vscode-focusBorder); }
  .flow-edge[aria-pressed="true"] { opacity: 1; stroke: var(--vscode-charts-orange, var(--vscode-focusBorder)); }
  .flow-node rect { fill: var(--vscode-charts-blue); stroke: var(--vscode-foreground); stroke-width: 1; }
  .flow-node text { fill: var(--vscode-foreground); font-size: 11px; }
  .flow-node-file { fill: var(--vscode-descriptionForeground); font-size: 9px; }
  .flow-node:focus rect, .flow-node:hover rect { stroke: var(--vscode-focusBorder); stroke-width: 2; }
  .flow-node[aria-pressed="true"] rect { fill: var(--vscode-charts-orange, var(--vscode-focusBorder)); stroke-width: 2; }
  .flow-inspector { border: 1px solid var(--vscode-panel-border); box-sizing: border-box; display: flex; flex: 0 1 320px; flex-direction: column; max-width: 360px; min-height: 420px; min-width: 240px; padding: 14px; position: sticky; top: 90px; transition: flex-basis 180ms ease, max-width 180ms ease, min-height 180ms ease; }
  .flow-inspector h3, .flow-inspector h4 { margin: 4px 0 10px; }
  .flow-inspector dl { display: flex; flex-direction: column; gap: 8px; margin: 0 0 16px; }
  .flow-inspector dl div { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 7px; }
  .flow-inspector dt { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; }
  .flow-inspector dd { margin: 2px 0 0; overflow-wrap: anywhere; }
  .flow-provenance { display: flex; flex-direction: column; gap: 10px; list-style: none; margin: 0; padding: 0; }
  .flow-provenance li { display: flex; flex-direction: column; gap: 3px; }
  .flow-provenance span { color: var(--vscode-descriptionForeground); }
  .flow-table caption { color: var(--vscode-descriptionForeground); padding: 8px; text-align: left; }
  .token-lens { border: 1px solid var(--vscode-panel-border); margin: 14px 0; padding: 14px; }
  .token-lens-heading { align-items: flex-start; display: flex; flex-wrap: wrap; gap: 8px 16px; justify-content: space-between; }
  .token-lens-heading h3 { margin: 0; }
  .token-lens-heading p { color: var(--vscode-descriptionForeground); margin: 3px 0 10px; }
  .token-lens-heading > span { color: var(--vscode-descriptionForeground); }
  .token-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 4px 0 10px; }
  .token-legend span::before { border: 1px solid currentColor; content: ""; display: inline-block; height: 9px; margin-right: 5px; width: 12px; }
  .token-legend .input::before { background: var(--vscode-charts-blue); }
  .token-legend .output::before { background: var(--vscode-charts-green); }
  .token-legend .cached::before { background: var(--vscode-charts-purple, var(--vscode-charts-orange)); }
  .token-legend .gap::before { border-style: dashed; }
  .token-lens-layout { align-items: stretch; display: flex; flex-wrap: nowrap; gap: 12px; min-width: 0; }
  .token-visualization { display: flex; flex: 1 1 620px; flex-direction: column; min-width: 0; }
  .token-chart-scroll { align-items: center; border: 1px solid var(--vscode-panel-border); box-sizing: border-box; display: flex; flex: 1 1 auto; min-height: 300px; min-width: 0; overflow: auto; transition: min-height 180ms ease; width: 100%; }
  .token-chart { background: var(--vscode-editor-background); display: block; flex: 0 0 auto; margin: auto; }
  .token-baseline, .token-session-break { stroke: var(--vscode-panel-border); stroke-width: 1; }
  .token-session-break { stroke-dasharray: 3 4; }
  .token-hit-area { fill: transparent; stroke: transparent; stroke-width: 2; }
  .token-input, .token-total { fill: var(--vscode-charts-blue); }
  .token-output { fill: var(--vscode-charts-green); }
  .token-cached { fill: var(--vscode-charts-purple, var(--vscode-charts-orange)); opacity: .8; }
  .token-gap { stroke: var(--vscode-descriptionForeground); stroke-dasharray: 3 3; stroke-width: 3; }
  .token-axis-label { fill: var(--vscode-descriptionForeground); font-size: 9px; }
  .token-bar:focus .token-hit-area, .token-bar:hover .token-hit-area, .token-bar[aria-pressed="true"] .token-hit-area { stroke: var(--vscode-focusBorder); }
  .token-bar[aria-pressed="true"] { filter: brightness(1.2); }
  .flow-node.token-highlight rect { fill: var(--vscode-charts-orange, var(--vscode-focusBorder)); stroke-width: 2; }
  .token-turn-detail { border: 1px solid var(--vscode-panel-border); box-sizing: border-box; display: flex; flex: 0 1 320px; flex-direction: column; max-width: 360px; min-width: 240px; padding: 12px; transition: flex-basis 180ms ease, max-width 180ms ease; }
  .token-turn-detail h4 { margin: 3px 0 10px; }
  .token-turn-detail dl { display: flex; flex-direction: column; gap: 6px; margin: 0 0 10px; }
  .token-turn-detail dl div { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; }
  .token-turn-detail dt { color: var(--vscode-descriptionForeground); font-size: 10px; text-transform: uppercase; }
  .token-turn-detail dd { margin: 1px 0 0; overflow-wrap: anywhere; }
  .token-slider-label { align-items: center; display: flex; gap: 10px; margin: 12px 0 0; }
  .token-slider-label input { flex: 1 1 auto; min-width: 0; padding: 0; }
  .token-slider-label output { min-width: 70px; text-align: right; }
  section, article { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
  section { padding: 16px; } section > p, .section-title p { color: var(--vscode-descriptionForeground); margin: 5px 0 14px; }
  .summary { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
  article { display: grid; gap: 5px; min-height: 72px; padding: 14px; }
  article strong { font-size: 17px; } small { color: var(--vscode-descriptionForeground); display: block; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; cursor: pointer; padding: 7px 12px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { cursor: default; opacity: .55; }
  button.link { background: transparent; color: var(--vscode-textLink-foreground); padding: 0; text-align: left; }
  .scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; } th, td { border-bottom: 1px solid var(--vscode-panel-border); padding: 9px 10px; text-align: left; vertical-align: top; } th { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; }
  .history-toolbar { align-items: end; display: flex; flex-wrap: wrap; gap: 10px 16px; justify-content: flex-start; margin: 12px 0; }
  .history-search { display: grid; gap: 4px; }
  .table-pagination { align-items: center; border: 0; display: flex; justify-content: center; gap: 12px; padding: 12px 0 0; }
  .table-pagination span { min-width: 90px; text-align: center; }
  .section-title { align-items: start; display: flex; justify-content: space-between; gap: 15px; }
  .trend-state, .severity { border: 1px solid currentColor; display: inline-block; padding: 2px 7px; text-transform: capitalize; }
  .improving, .pass { color: var(--vscode-testing-iconPassed); } .degrading, .error { color: var(--vscode-testing-iconFailed); } .warning { color: var(--vscode-editorWarning-foreground); } .stable, .info { color: var(--vscode-editorInfo-foreground); } .insufficient_evidence, .unknown { color: var(--vscode-descriptionForeground); }
  .trend { height: 120px; width: 100%; } .trend line { stroke: currentColor; opacity: .2; } .trend polyline { fill: none; stroke: var(--vscode-charts-blue); stroke-width: 2; }
  .method, .empty { color: var(--vscode-descriptionForeground); } .empty { padding: 22px; text-align: center; }
  @media (forced-colors: active) { .flow-edge { opacity: 1; stroke: LinkText; } .flow-edge[aria-pressed="true"] { stroke: Highlight; } .flow-node rect, .token-input, .token-output, .token-total, .token-cached { fill: Canvas; stroke: CanvasText; stroke-width: 2; } .flow-node[aria-pressed="true"] rect, .flow-node.token-highlight rect, .token-bar[aria-pressed="true"] .token-hit-area { fill: Highlight; stroke: Highlight; } .flow-state, .flow-summary, .token-lens { border-color: CanvasText; } }
  @media (max-width: 1000px) { .flow-chart-layout, .token-lens-layout { flex-wrap: wrap; } .flow-chart-scroll { flex-basis: 100%; min-height: 460px; } .flow-inspector { flex: 1 1 100%; max-width: none; min-height: 300px; position: static; } .token-visualization { flex: 1 1 100%; min-width: 0; } .token-turn-detail { flex: 1 1 100%; max-width: none; min-width: 0; } }
  @media (max-width: 700px) { header { padding: 14px; } main { padding: 14px; } .summary { grid-template-columns: 1fr 1fr; } .flow-filter-grid label { flex-basis: 100%; } .flow-chart-scroll { min-height: 500px; } .flow-inspector { min-width: 0; } .token-lens { padding: 10px; } .token-chart-scroll { min-height: 260px; } .token-slider-label { align-items: stretch; flex-direction: column; } .token-slider-label output { text-align: left; } .history-toolbar { align-items: stretch; } .history-search, .history-search input { width: 100%; } }
  @media (prefers-reduced-motion: reduce) { .flow-chart-scroll, .flow-inspector, .token-chart-scroll, .token-turn-detail { transition: none; } }
</style></head><body>
<header><div><h1>Harness Lens</h1><small>Evidence-backed workspace observability</small></div><button id="refresh">Refresh report</button></header>
${state.report ? '<nav aria-label="Metrics sections"><a href="#overview">Overview</a><a href="#files">Files and skills</a><a href="#findings">Findings</a><a href="#scores">Scores</a><a href="#runtime">Runtime</a><a href="#flow">Observed flow</a><a href="#plugins">Plugins</a><a href="#history">History</a></nav>' : ""}
<main>${staleWarning}${body}</main>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  document.getElementById('runtime-settings')?.addEventListener('click', () => vscode.postMessage({ type: 'runtime-settings' }));
  document.getElementById('refresh-runtime')?.addEventListener('click', () => vscode.postMessage({ type: 'refresh-runtime' }));
  document.getElementById('flow-settings')?.addEventListener('click', () => vscode.postMessage({ type: 'flow-settings' }));
  document.getElementById('refresh-flow')?.addEventListener('click', () => vscode.postMessage({ type: 'refresh-flow' }));
  document.getElementById('flow-filters')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const value = name => String(data.get(name) || '').trim();
    const categories = value('categories').split(',').map(entry => entry.trim()).filter(Boolean);
    const minimumShare = value('minimumShare');
    vscode.postMessage({
      type: 'flow-filters',
      filters: {
        root: value('root'),
        maxHops: Number(value('maxHops')),
        windowStart: value('windowStart'),
        windowEnd: value('windowEnd'),
        categories,
        statuses: data.getAll('status').map(String),
        minimumShare: minimumShare === '' ? undefined : Number(minimumShare),
        metric: value('metric'),
        costUnit: value('costUnit'),
      },
    });
  });
  document.getElementById('file-filter')?.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    const rows = [...document.querySelectorAll('#files tbody tr[data-asset]')];
    let visible = 0;
    for (const row of rows) {
      row.hidden = !(row.querySelector('td')?.textContent || '').toLowerCase().includes(query);
      if (!row.hidden) visible++;
    }
    document.getElementById('file-filter-status').textContent = visible + ' of ' + rows.length + ' rows shown';
  });
  const findingsSection = document.getElementById('findings');
  const findingsRows = [...document.querySelectorAll('#findings tbody tr[data-finding-row]')];
  const findingsPrevious = document.getElementById('findings-previous');
  const findingsNext = document.getElementById('findings-next');
  const findingsPageStatus = document.getElementById('findings-page-status');
  const findingsNoResults = document.getElementById('findings-no-results');
  const findingsPageSize = Number(findingsSection?.dataset.findingsPageSize || 10);
  let findingsPage = 1;
  const renderFindings = () => {
    if (!findingsSection) return;
    const pageCount = findingsRows.length === 0 ? 0 : Math.ceil(findingsRows.length / findingsPageSize);
    findingsPage = pageCount === 0 ? 1 : Math.min(findingsPage, pageCount);
    const visible = new Set(findingsRows.slice((findingsPage - 1) * findingsPageSize, findingsPage * findingsPageSize));
    for (const row of findingsRows) row.hidden = !visible.has(row);
    findingsNoResults.hidden = findingsRows.length !== 0;
    findingsPageStatus.textContent = pageCount === 0 ? 'Page 0 of 0' : 'Page ' + findingsPage + ' of ' + pageCount;
    findingsPrevious.disabled = pageCount === 0 || findingsPage === 1;
    findingsNext.disabled = pageCount === 0 || findingsPage === pageCount;
  };
  findingsPrevious?.addEventListener('click', () => { findingsPage = Math.max(1, findingsPage - 1); renderFindings(); });
  findingsNext?.addEventListener('click', () => { findingsPage += 1; renderFindings(); });
  renderFindings();
  const historySection = document.getElementById('history');
  const historyRows = [...document.querySelectorAll('#history tbody tr[data-history-row]')];
  const historySearch = document.getElementById('history-search');
  const historyPrevious = document.getElementById('history-previous');
  const historyNext = document.getElementById('history-next');
  const historyPageStatus = document.getElementById('history-page-status');
  const historyFilterStatus = document.getElementById('history-filter-status');
  const historyNoResults = document.getElementById('history-no-results');
  const historyPageSize = Number(historySection?.dataset.historyPageSize || 10);
  let historyPage = 1;
  const renderHistory = () => {
    if (!historySection) return;
    const query = historySearch.value.trim().toLowerCase();
    const matching = historyRows.filter(row => (row.textContent || '').toLowerCase().includes(query));
    const pageCount = matching.length === 0 ? 0 : Math.ceil(matching.length / historyPageSize);
    historyPage = pageCount === 0 ? 1 : Math.min(historyPage, pageCount);
    const visible = new Set(matching.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize));
    for (const row of historyRows) row.hidden = !visible.has(row);
    historyNoResults.hidden = matching.length !== 0;
    historyNoResults.querySelector('td').textContent = historyRows.length === 0
      ? 'No local snapshots recorded.'
      : 'No snapshots match your search.';
    historyFilterStatus.textContent = matching.length + ' of ' + historyRows.length + ' snapshots';
    historyPageStatus.textContent = pageCount === 0 ? 'Page 0 of 0' : 'Page ' + historyPage + ' of ' + pageCount;
    historyPrevious.disabled = pageCount === 0 || historyPage === 1;
    historyNext.disabled = pageCount === 0 || historyPage === pageCount;
  };
  historySearch?.addEventListener('input', () => { historyPage = 1; renderHistory(); });
  historyPrevious?.addEventListener('click', () => { historyPage = Math.max(1, historyPage - 1); renderHistory(); });
  historyNext?.addEventListener('click', () => { historyPage += 1; renderHistory(); });
  renderHistory();
  document.querySelectorAll('[data-open]').forEach((element) => element.addEventListener('click', () => vscode.postMessage({ type: 'open', path: element.dataset.open, line: Number(element.dataset.line || 1) })));
  const openFlow = element => vscode.postMessage({ type: 'flow-open', uri: element.dataset.flowUri, line: Number(element.dataset.flowLine), character: Number(element.dataset.flowCharacter) });
  document.querySelectorAll('[data-flow-uri]:not(.token-open)').forEach((element) => {
    element.addEventListener('click', () => openFlow(element));
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFlow(element); }
    });
  });
  const tokenSlider = document.getElementById('token-turn-slider');
  const tokenPosition = document.getElementById('token-turn-position');
  const tokenDetail = document.getElementById('token-turn-detail');
  const tokenBars = [...document.querySelectorAll('[data-token-index]')];
  const selectTokenTurn = (index, reveal = true) => {
    const selectedIndex = Math.max(0, Math.min(tokenBars.length - 1, Number(index)));
    const bar = tokenBars[selectedIndex];
    const template = document.getElementById('token-detail-' + selectedIndex);
    if (!bar || !tokenDetail || !template?.content) return;
    if (tokenSlider) tokenSlider.value = String(selectedIndex);
    if (tokenPosition) tokenPosition.textContent = (selectedIndex + 1) + ' of ' + tokenBars.length;
    for (const candidate of tokenBars) {
      candidate.setAttribute('aria-pressed', String(candidate === bar));
    }
    document.querySelectorAll('.flow-node').forEach(node => {
      node.classList.toggle('token-highlight', node.dataset.flowLayer === bar.dataset.tokenLayer && node.dataset.flowLogical === bar.dataset.tokenAction);
    });
    tokenDetail.replaceChildren(template.content.cloneNode(true));
    const scroller = bar.closest('.token-chart-scroll');
    if (reveal && scroller) {
      const barBounds = bar.getBoundingClientRect();
      const scrollerBounds = scroller.getBoundingClientRect();
      scroller.scrollLeft += barBounds.left - scrollerBounds.left - (scrollerBounds.width - barBounds.width) / 2;
    }
  };
  tokenBars.forEach((bar) => {
    bar.addEventListener('click', () => selectTokenTurn(bar.dataset.tokenIndex));
    bar.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTokenTurn(bar.dataset.tokenIndex); }
    });
  });
  tokenSlider?.addEventListener('input', event => selectTokenTurn(event.target.value));
  if (tokenBars.length > 0) selectTokenTurn(0, false);
  tokenDetail?.addEventListener('click', event => {
    const evidence = event.target?.closest?.('[data-flow-uri]');
    if (evidence) openFlow(evidence);
  });
  const flowInspector = document.getElementById('flow-inspector-content');
  const inspectFlow = element => {
    const selection = element.dataset.flowSelection;
    const template = document.getElementById('flow-detail-' + selection);
    if (!flowInspector || !template?.content) return;
    document.querySelectorAll('[data-flow-selection]').forEach(candidate => {
      candidate.setAttribute('aria-pressed', String(candidate.dataset.flowSelection === selection));
    });
    flowInspector.replaceChildren(template.content.cloneNode(true));
    const matchingTurn = tokenBars.find(bar => bar.dataset.tokenLayer === element.dataset.flowLayer && bar.dataset.tokenAction === element.dataset.flowLogical);
    if (matchingTurn) selectTokenTurn(matchingTurn.dataset.tokenIndex);
  };
  document.querySelectorAll('[data-flow-selection]').forEach((element) => {
    element.addEventListener('click', () => inspectFlow(element));
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspectFlow(element); }
    });
  });
  document.getElementById('flow-inspector')?.addEventListener('click', event => {
    const evidence = event.target?.closest?.('[data-flow-uri]');
    if (evidence) openFlow(evidence);
  });
</script></body></html>`;
}
