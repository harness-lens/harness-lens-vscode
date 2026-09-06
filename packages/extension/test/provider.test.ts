// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  parseProviderAggregate,
  parseProviderCatalog,
  ProviderProtocolService,
} from "../src/provider-service.ts";
import {
  codeBurnPolicyBlock,
  providerInitializationOptions,
  resolveProviderSettings,
  runtimeEnvironment,
} from "../src/provider-settings.ts";

test("runtime mode cannot select CodeBurn without explicit provider consent", () => {
  const settings = resolveProviderSettings({
    runtimeMode: "live",
    codeBurnEnabled: false,
    executable: "/should/be/ignored",
    period: "invalid period",
  });

  assert.equal(settings.requestedMode, "live");
  assert.equal(settings.runtimeMode, "off");
  assert.equal(settings.executable, undefined);
  assert.deepEqual(settings.issues, []);
  assert.deepEqual(
    providerInitializationOptions(settings, {
      workspaceTrusted: true,
      virtualWorkspace: false,
    }),
    {
      harnessLens: {
        workspaceTrusted: true,
        virtualWorkspace: false,
        selectedProviders: [],
      },
    },
  );
  assert.deepEqual(runtimeEnvironment({
    KEEP: "yes",
    HARNESS_METRICS_CODEBURN_EXECUTABLE: "stale",
    HARNESS_METRICS_SNAPSHOT_PATH: "stale",
  }, settings), {
    KEEP: "yes",
    HARNESS_METRICS_MODE: "off",
  });
});

test("validated live and snapshot settings serialize only mode-relevant values", () => {
  const live = resolveProviderSettings({
    runtimeMode: "live",
    codeBurnEnabled: true,
    executable: " /opt/codeburn ",
    period: "30days",
    snapshotPath: "/ignored.json",
    maxFiles: 25,
  });
  assert.equal(live.runtimeMode, "live");
  assert.equal(live.maxFiles, 25);
  assert.deepEqual(providerInitializationOptions(live, {
    workspaceTrusted: true,
    virtualWorkspace: false,
  }).harnessLens.selectedProviders, ["codeburn"]);
  assert.deepEqual(runtimeEnvironment({}, live), {
    HARNESS_METRICS_MODE: "live",
    HARNESS_METRICS_CODEBURN_EXECUTABLE: "/opt/codeburn",
    HARNESS_METRICS_CODEBURN_PERIOD: "30days",
  });

  const snapshot = resolveProviderSettings({
    runtimeMode: "snapshot",
    codeBurnEnabled: true,
    executable: "/ignored",
    period: "ignored period",
    snapshotPath: " /tmp/report.json ",
  });
  assert.deepEqual(runtimeEnvironment({}, snapshot), {
    HARNESS_METRICS_MODE: "snapshot",
    HARNESS_METRICS_SNAPSHOT_PATH: "/tmp/report.json",
  });
});

test("invalid active settings fail closed with actionable setting identities", () => {
  const period = resolveProviderSettings({
    runtimeMode: "live",
    codeBurnEnabled: true,
    period: "not valid",
    maxFiles: 0,
  });
  assert.equal(period.runtimeMode, "off");
  assert.deepEqual(period.issues.map((issue) => issue.setting), [
    "harnessLens.report.maxFiles",
    "harnessLens.runtime.period",
  ]);
  assert.equal(period.maxFiles, 5000);

  const snapshot = resolveProviderSettings({
    runtimeMode: "snapshot",
    codeBurnEnabled: true,
    snapshotPath: " ",
  });
  assert.equal(snapshot.runtimeMode, "off");
  assert.equal(snapshot.issues[0]?.setting, "harnessLens.runtime.snapshotPath");
});

test("workspace policy blocks optional provider consent", () => {
  assert.match(codeBurnPolicyBlock({ workspaceTrusted: false, virtualWorkspace: false })!, /Trust/);
  assert.match(codeBurnPolicyBlock({ workspaceTrusted: true, virtualWorkspace: true })!, /virtual/);
  assert.equal(codeBurnPolicyBlock({ workspaceTrusted: true, virtualWorkspace: false }), undefined);
});

test("process-wide provider settings use one window scope", () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as {
    contributes: {
      configuration: {
        properties: Record<string, { scope?: string }>;
      };
    };
  };
  const properties = manifest.contributes.configuration.properties;

  assert.equal(properties["harnessLens.providers.codeburn.enabled"]?.scope, "window");
  assert.equal(properties["harnessLens.runtime.mode"]?.scope, "window");
  assert.equal(properties["harnessLens.runtime.period"]?.scope, "window");
  assert.equal(properties["harnessLens.report.maxFiles"]?.scope, "resource");
});

test("parses typed provider catalog and rejects unknown safe enums", () => {
  const catalog = parseProviderCatalog(catalogResponse());
  assert.equal(catalog.providers[0]?.descriptor.id, "harness-lens-native");
  assert.equal(catalog.providers[1]?.descriptor.version, "0.9.24");
  assert.equal(catalog.providers[1]?.refresh.lastSuccess, 2);

  const invalid = catalogResponse();
  invalid.providers[1]!.availability = "downloaded";
  assert.throws(() => parseProviderCatalog(invalid), /Unsupported provider availability/);
});

test("parses namespaced sample-bearing provider aggregate without changing Native", () => {
  const response = parseProviderAggregate(aggregateResponse());
  assert.equal(response.native.sources.length, 0);
  assert.equal(response.aggregate.reports.codeburn?.contributions[0]?.method, "statistical");
  assert.equal(response.aggregate.reports.codeburn?.contributions[0]?.sampleSize, 12);
  assert.deepEqual(response.aggregate.selectedProviders, ["harness-lens-native", "codeburn"]);
  assert.equal(response.runtime.state, "ready");

  const missingSample = aggregateResponse();
  const aggregate = missingSample.aggregate as Record<string, unknown>;
  const reports = aggregate.reports as Record<string, Record<string, unknown>>;
  const codeburn = reports.codeburn!;
  const contribution = (codeburn.contributions as Record<string, unknown>[])[0]!;
  contribution.sample_size = null;
  assert.throws(() => parseProviderAggregate(missingSample), /requires sample_size/);
});

test("provider service sends only fixed method names and bounded request parameters", async () => {
  const calls: { method: string; parameters: unknown }[] = [];
  const service = new ProviderProtocolService(async (method, parameters) => {
    calls.push({ method, parameters });
    return method.endsWith("providerCatalog") ? catalogResponse() : aggregateResponse();
  });

  await service.catalog();
  await service.aggregate("file:///workspace", 5000);
  assert.deepEqual(calls, [
    { method: "harnessLens/providerCatalog", parameters: {} },
    {
      method: "harnessLens/providerAggregate",
      parameters: { rootUri: "file:///workspace", maxFiles: 5000 },
    },
  ]);
  await assert.rejects(
    () => service.aggregate("https://example.invalid/workspace", 5000),
    /file scheme/,
  );
  await assert.rejects(
    () => service.aggregate("file:///workspace", 50001),
    /1 through 50,000/,
  );
});

function catalogResponse(): {
  schemaVersion: number;
  providers: Record<string, unknown>[];
} {
  return {
    schemaVersion: 1,
    providers: [
      providerStatus("harness-lens-native", "Harness Lens Native", false, "built_in", null),
      providerStatus("codeburn", "CodeBurn", true, "installed", "0.9.24"),
    ],
  };
}

function providerStatus(
  id: string,
  displayName: string,
  optional: boolean,
  installation: string,
  version: string | null,
): Record<string, unknown> {
  return {
    descriptor: {
      id,
      display_name: displayName,
      version,
      license: optional ? "MIT" : "MPL-2.0",
      source_url: `https://example.invalid/${id}`,
      capabilities: optional ? ["runtime_aggregates", "snapshots"] : ["deterministic_analysis"],
      configuration: optional ? ["runtime_mode"] : [],
      platforms: ["linux", "macos", "windows"],
      methods: optional ? ["statistical"] : ["deterministic", "heuristic"],
      optional,
    },
    selected: true,
    availability: "available",
    installation,
    refresh: {
      generation: 3,
      last_success: 2,
      health: "healthy",
      error: null,
    },
  };
}

function aggregateResponse(): Record<string, unknown> {
  const contribution = {
    metric: "calls",
    value: 12,
    method: "statistical",
    sample_size: 12,
    assumptions: ["runtime_aggregate_not_causal", "provider_window"],
    evidence: [],
    fingerprint: null,
  };
  return {
    schemaVersion: 1,
    rootUri: "file:///workspace",
    native: nativeReport(),
    aggregate: {
      schema_version: 1,
      selected_providers: ["harness-lens-native", "codeburn"],
      reports: {
        "harness-lens-native": {
          provider_id: "harness-lens-native",
          generation: 1,
          contributions: [{
            metric: "sources",
            value: 0,
            method: "deterministic",
            sample_size: null,
            assumptions: ["local_inventory"],
            evidence: [],
            fingerprint: null,
          }],
        },
        codeburn: {
          provider_id: "codeburn",
          generation: 2,
          contributions: [contribution],
        },
      },
      provenance: [{ provider_ids: ["codeburn"], contribution }],
      refresh: {
        "harness-lens-native": {
          generation: 1,
          last_success: 1,
          health: "healthy",
          error: null,
        },
        codeburn: {
          generation: 2,
          last_success: 2,
          health: "healthy",
          error: null,
        },
      },
    },
    runtime: {
      mode: "live",
      state: "ready",
      period: "30days",
      calls: 12,
      sessions: 3,
      warningCount: 0,
      hasSnapshot: true,
    },
  };
}

function nativeReport(): Record<string, unknown> {
  return {
    schema_version: 1,
    root: "/workspace",
    completeness: { complete: true, reasons: [] },
    sources: [],
    inclusions: [],
    findings: [],
    metrics: [],
    scores: [],
    score_summary: { quality_mean: null, safety_violations: 0 },
    plugin_executions: [],
  };
}
