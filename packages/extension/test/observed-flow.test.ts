// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultObservedFlowFilters,
  normalizeObservedFlowFilters,
  ObservedFlowService,
  parseObservedFlow,
} from "../src/observed-flow-service.ts";

test("parses a bounded populated layered observed-flow graph", () => {
  const parsed = parseObservedFlow(populatedResponse());
  assert.equal(parsed.graph.kind, "observed_flow");
  assert.equal(parsed.graph.edges[0]?.metric.unit, "transitions");
  assert.equal(parsed.graph.edges[0]?.metric.denominator, 4);
  assert.equal(parsed.graph.edges[0]?.metric.sampleSize, 3);
  assert.equal(parsed.graph.edges[0]?.provenance[0]?.location?.range.start.character, 2);
  assert.equal(parsed.graph.nodes[2]?.logicalId, "read");
  assert.equal(parsed.graph.nodes[2]?.layer, 2);
});

test("rejects static inference, inconsistent width semantics, and unsafe navigation", () => {
  const staticEdge = populatedResponse();
  (staticEdge.graph as Record<string, unknown>).edges = [
    { ...(staticEdge.graph.edges as Record<string, unknown>[])[0], relationship: "static" },
  ];
  assert.throws(() => parseObservedFlow(staticEdge), /statistical observed_transition/);

  const badShare = populatedResponse();
  const badMetric = (badShare.graph.edges as Record<string, unknown>[])[0]!
    .metric as Record<string, unknown>;
  badMetric.share = 0.5;
  assert.throws(() => parseObservedFlow(badShare), /share does not match/);

  const badLocation = populatedResponse();
  const provenance = (badLocation.graph.edges as Record<string, unknown>[])[0]!
    .provenance as Record<string, unknown>[];
  (provenance[0]!.location as Record<string, unknown>).uri = "https://example.invalid/source";
  assert.throws(() => parseObservedFlow(badLocation), /file scheme/);

  const statisticalNode = populatedResponse();
  const nodeProvenance = (statisticalNode.graph.nodes as Record<string, unknown>[])[0]!
    .provenance as Record<string, unknown>[];
  nodeProvenance[0]!.method = "statistical";
  assert.throws(() => parseObservedFlow(statisticalNode), /node provenance method must be deterministic/);

  const deterministicEdge = populatedResponse();
  const edgeProvenance = (deterministicEdge.graph.edges as Record<string, unknown>[])[0]!
    .provenance as Record<string, unknown>[];
  edgeProvenance[0]!.method = "deterministic";
  assert.throws(() => parseObservedFlow(deterministicEdge), /edge provenance method must be statistical/);
});

test("normalizes supported filters and rejects incomplete windows or cost units", () => {
  assert.deepEqual(normalizeObservedFlowFilters({
    root: " read ",
    maxHops: 4,
    windowStart: "a",
    windowEnd: "z",
    categories: ["tool"],
    statuses: ["timeout", "success"],
    minimumShare: 0.1,
    metric: "cost",
    costUnit: "USD",
  }), {
    root: "read",
    maxHops: 4,
    windowStart: "a",
    windowEnd: "z",
    categories: ["tool"],
    statuses: ["success", "timeout"],
    minimumShare: 0.1,
    metric: "cost",
    costUnit: "USD",
  });
  assert.throws(
    () => normalizeObservedFlowFilters({ ...defaultObservedFlowFilters, windowStart: "a" }),
    /supplied together/,
  );
  assert.throws(
    () => normalizeObservedFlowFilters({ ...defaultObservedFlowFilters, metric: "cost" }),
    /requires costUnit/,
  );
});

test("service sends one fixed bounded provider-neutral request", async () => {
  const calls: { method: string; parameters: unknown }[] = [];
  const service = new ObservedFlowService(async (method, parameters) => {
    calls.push({ method, parameters });
    return unavailableResponse();
  });
  await service.flow("file:///workspace", defaultObservedFlowFilters);
  assert.deepEqual(calls, [{
    method: "harnessLens/observedFlow",
    parameters: {
      rootUri: "file:///workspace",
      maxNodes: 256,
      maxEdges: 512,
      maxHops: 32,
      categories: [],
      statuses: [],
      metric: "transitions",
    },
  }]);
  await assert.rejects(
    () => service.flow("https://example.invalid/workspace", defaultObservedFlowFilters),
    /file scheme/,
  );
});

function unavailableResponse(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    rootUri: "file:///workspace",
    status: {
      state: "off",
      generation: 0,
      hasSnapshot: false,
      observations: 0,
      sessions: 0,
    },
    graph: {
      schema_version: 1,
      kind: "observed_flow",
      method: "statistical",
      availability: "unavailable",
      completeness: { complete: false, reasons: [{ code: "runtime_off" }] },
      limits: { max_nodes: 256, max_edges: 512, max_hops: 32 },
      filters: { metric_unit: "transitions" },
      nodes: [],
      edges: [],
    },
  };
}

function populatedResponse(): Record<string, any> {
  const provenance = (
    id: string,
    method: "deterministic" | "statistical",
    location = false,
  ): Record<string, unknown> => ({
    source: "harness-lens-sdk",
    method,
    evidence_ids: [id],
    total_evidence: 1,
    ...(location ? {
      location: {
        uri: "file:///workspace/AGENTS.md",
        range: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 4 },
        },
      },
    } : {}),
  });
  return {
    schemaVersion: 1,
    rootUri: "file:///workspace",
    status: {
      state: "ready",
      generation: 1,
      lastSuccess: 1,
      hasSnapshot: true,
      observations: 5,
      sessions: 2,
    },
    graph: {
      schema_version: 1,
      kind: "observed_flow",
      method: "statistical",
      availability: "ready",
      completeness: { complete: true },
      limits: { max_nodes: 256, max_edges: 512, max_hops: 32 },
      filters: { metric_unit: "transitions" },
      nodes: [
        { id: "n0", logical_id: "read", label: "Read", kind: "action", layer: 0, provenance: [provenance("one", "deterministic")] },
        { id: "n1", logical_id: "write", label: "Write", kind: "action", layer: 1, provenance: [provenance("two", "deterministic", true)] },
        { id: "n2", logical_id: "read", label: "Read", kind: "action", layer: 2, provenance: [provenance("three", "deterministic")] },
      ],
      edges: [
        {
          id: "e0",
          source: "n0",
          target: "n1",
          relationship: "observed_transition",
          method: "statistical",
          metric: {
            value: 3,
            unit: "transitions",
            denominator: 4,
            share: 0.75,
            sample_size: 3,
            window: { start: "a", end: "z" },
          },
          provenance: [provenance("two", "statistical", true)],
        },
        {
          id: "e1",
          source: "n1",
          target: "n2",
          relationship: "observed_transition",
          method: "statistical",
          metric: {
            value: 1,
            unit: "transitions",
            denominator: 4,
            share: 0.25,
            sample_size: 1,
            window: { start: "a", end: "z" },
          },
          provenance: [provenance("three", "statistical")],
        },
      ],
    },
  };
}
