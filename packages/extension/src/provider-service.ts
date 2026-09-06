// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import {
  parseAnalysisReport,
  parseRuntimeStatus,
  type AnalysisReport,
  type RuntimeStatus,
} from "./center-model.js";

export const providerCatalogMethod = "harnessLens/providerCatalog";
export const providerAggregateMethod = "harnessLens/providerAggregate";

export type ProviderError =
  | "invalid_provider"
  | "not_found"
  | "invalid_version"
  | "configuration_error"
  | "runtime_failure"
  | "workspace_blocked"
  | "timeout"
  | "limit_exceeded"
  | "invalid_report"
  | "unsupported_installation"
  | "consent_required";
export type ProviderAvailability =
  | "off"
  | "available"
  | "not_found"
  | "invalid_version"
  | "configuration_error"
  | "runtime_failure"
  | "blocked";
export type InstallationStatus = "built_in" | "installed" | "not_installed" | "unknown";
export type ProviderHealth = "never_refreshed" | "healthy" | "stale" | "failed" | "disabled";
export type ProviderCapability =
  | "deterministic_analysis"
  | "lexical_similarity"
  | "runtime_aggregates"
  | "snapshots"
  | "installation_planning";
export type ConfigurationRequirement = "executable" | "runtime_mode" | "snapshot_path";
export type ProviderPlatform = "linux" | "macos" | "windows";
export type ScoreMethod = "deterministic" | "heuristic" | "statistical" | "probabilistic";
export type ProviderMetric = "sources" | "calls" | "sessions" | "cost_usd" | "tokens";
export type ProviderAssumption =
  | "local_inventory"
  | "runtime_aggregate_not_causal"
  | "provider_window";

export interface ProviderDescriptor {
  id: string;
  displayName: string;
  version?: string;
  license?: string;
  sourceUrl: string;
  capabilities: readonly ProviderCapability[];
  configuration: readonly ConfigurationRequirement[];
  platforms: readonly ProviderPlatform[];
  methods: readonly ScoreMethod[];
  optional: boolean;
}

export interface RefreshState {
  generation: number;
  lastSuccess?: number;
  health: ProviderHealth;
  error?: ProviderError;
}

export interface ProviderStatus {
  descriptor: ProviderDescriptor;
  selected: boolean;
  availability: ProviderAvailability;
  installation: InstallationStatus;
  refresh: RefreshState;
}

export interface ProviderContribution {
  metric: ProviderMetric;
  value: number;
  method: ScoreMethod;
  sampleSize?: number;
  assumptions: readonly ProviderAssumption[];
  evidence: readonly { sourceIndex: number; span: { start: number; end: number } }[];
  fingerprint?: readonly number[];
}

export interface ProviderReport {
  providerId: string;
  generation: number;
  contributions: readonly ProviderContribution[];
}

export interface AggregateEnvelope {
  schemaVersion: number;
  selectedProviders: readonly string[];
  reports: Readonly<Record<string, ProviderReport>>;
  provenance: readonly {
    providerIds: readonly string[];
    contribution: ProviderContribution;
  }[];
  refresh: Readonly<Record<string, RefreshState>>;
}

export interface ProviderCatalogResponse {
  schemaVersion: number;
  providers: readonly ProviderStatus[];
  issue?: ProviderError;
}

export interface ProviderAggregateResponse {
  schemaVersion: number;
  rootUri: string;
  native: AnalysisReport;
  aggregate: AggregateEnvelope;
  runtime: RuntimeStatus;
  issue?: ProviderError;
}

export type ProviderRequest = (method: string, parameters: unknown) => Promise<unknown>;

export class ProviderProtocolService {
  constructor(private readonly request: ProviderRequest) {}

  async catalog(): Promise<ProviderCatalogResponse> {
    return parseProviderCatalog(await this.request(providerCatalogMethod, {}));
  }

  async aggregate(rootUri: string, maxFiles: number): Promise<ProviderAggregateResponse> {
    if (!rootUri.startsWith("file://")) {
      throw new Error("Provider aggregate rootUri must use the file scheme.");
    }
    if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 50000) {
      throw new Error("Provider aggregate maxFiles must be an integer from 1 through 50,000.");
    }
    const response = parseProviderAggregate(
      await this.request(providerAggregateMethod, { rootUri, maxFiles }),
    );
    if (response.rootUri !== rootUri) {
      throw new Error("Provider aggregate response rootUri does not match request.");
    }
    return response;
  }
}

export function parseProviderCatalog(value: unknown): ProviderCatalogResponse {
  const response = record(value, "provider catalog response");
  const schemaVersion = protocolVersion(response.schemaVersion, "provider catalog schemaVersion");
  const providers = boundedList(response.providers, "provider catalog providers", 16)
    .map(parseProviderStatus);
  const providerIds = providers.map((provider) => provider.descriptor.id);
  const native = providers.find((provider) => provider.descriptor.id === "harness-lens-native");
  if (new Set(providerIds).size !== providerIds.length) {
    throw new Error("Provider catalog contains duplicate provider identities.");
  }
  if (
    !native
    || native.descriptor.optional
    || !native.selected
    || native.availability !== "available"
    || native.installation !== "built_in"
  ) {
    throw new Error("Provider catalog must preserve available built-in Native provider.");
  }
  const issue = optionalChoice(response.issue, providerErrors, "provider catalog issue");
  return {
    schemaVersion,
    providers,
    ...(issue === undefined ? {} : { issue }),
  };
}

export function parseProviderAggregate(value: unknown): ProviderAggregateResponse {
  const response = record(value, "provider aggregate response");
  const schemaVersion = protocolVersion(response.schemaVersion, "provider aggregate schemaVersion");
  const issue = optionalChoice(response.issue, providerErrors, "provider aggregate issue");
  return {
    schemaVersion,
    rootUri: string(response.rootUri, "provider aggregate rootUri"),
    native: parseAnalysisReport(response.native),
    aggregate: parseAggregateEnvelope(response.aggregate),
    runtime: parseRuntimeStatus(response.runtime),
    ...(issue === undefined ? {} : { issue }),
  };
}

function parseProviderStatus(value: unknown): ProviderStatus {
  const status = record(value, "provider status");
  const descriptor = record(status.descriptor, "provider descriptor");
  const version = optionalString(descriptor.version, "provider version");
  const license = optionalString(descriptor.license, "provider license");
  return {
    descriptor: {
      id: string(descriptor.id, "provider id"),
      displayName: string(descriptor.display_name, "provider display_name"),
      ...(version === undefined ? {} : { version }),
      ...(license === undefined ? {} : { license }),
      sourceUrl: string(descriptor.source_url, "provider source_url"),
      capabilities: choices(descriptor.capabilities, providerCapabilities, "provider capabilities"),
      configuration: choices(descriptor.configuration, configurationRequirements, "provider configuration"),
      platforms: choices(descriptor.platforms, providerPlatforms, "provider platforms"),
      methods: choices(descriptor.methods, scoreMethods, "provider methods"),
      optional: boolean(descriptor.optional, "provider optional"),
    },
    selected: boolean(status.selected, "provider selected"),
    availability: choice(status.availability, providerAvailability, "provider availability"),
    installation: choice(status.installation, installationStatuses, "provider installation"),
    refresh: parseRefreshState(status.refresh),
  };
}

function parseAggregateEnvelope(value: unknown): AggregateEnvelope {
  const envelope = record(value, "aggregate envelope");
  const reports = mapped(envelope.reports, "aggregate reports", 16, parseProviderReport);
  const refresh = mapped(envelope.refresh, "aggregate refresh", 16, parseRefreshState);
  const selectedProviders = strings(envelope.selected_providers, "selected providers", 16);
  if (
    !selectedProviders.includes("harness-lens-native")
    || new Set(selectedProviders).size !== selectedProviders.length
  ) {
    throw new Error("Provider aggregate selection must contain unique Native provider identity.");
  }
  for (const [id, report] of Object.entries(reports)) {
    if (report.providerId !== id) {
      throw new Error("Provider report namespace does not match provider_id.");
    }
    if (!selectedProviders.includes(id)) {
      throw new Error("Provider report namespace is not selected.");
    }
  }
  for (const id of Object.keys(refresh)) {
    if (!selectedProviders.includes(id)) {
      throw new Error("Provider refresh namespace is not selected.");
    }
  }
  if (!reports["harness-lens-native"] || !refresh["harness-lens-native"]) {
    throw new Error("Provider aggregate must preserve Native report and refresh state.");
  }
  return {
    schemaVersion: protocolVersion(envelope.schema_version, "aggregate schema_version"),
    selectedProviders,
    reports,
    provenance: boundedList(envelope.provenance, "aggregate provenance", 32768).map((value) => {
      const provenance = record(value, "merge provenance");
      const providerIds = strings(provenance.provider_ids, "provenance provider_ids", 16);
      if (
        providerIds.length === 0
        || new Set(providerIds).size !== providerIds.length
        || providerIds.some((id) => !selectedProviders.includes(id))
      ) {
        throw new Error("Merge provenance must contain unique selected provider identities.");
      }
      return {
        providerIds,
        contribution: parseContribution(provenance.contribution),
      };
    }),
    refresh,
  };
}

function parseProviderReport(value: unknown): ProviderReport {
  const report = record(value, "provider report");
  const contributions = boundedList(report.contributions, "provider contributions", 2048)
    .map(parseContribution);
  return {
    providerId: string(report.provider_id, "provider report provider_id"),
    generation: nonNegativeInteger(report.generation, "provider report generation"),
    contributions,
  };
}

function parseContribution(value: unknown): ProviderContribution {
  const contribution = record(value, "provider contribution");
  const sampleSize = optionalNonNegativeInteger(contribution.sample_size, "provider contribution sample_size");
  const fingerprint = parseFingerprint(contribution.fingerprint);
  const assumptions = choices(
    contribution.assumptions,
    providerAssumptions,
    "provider assumptions",
    16,
  );
  const evidence = boundedList(contribution.evidence, "provider evidence", 32).map((value) => {
    const item = record(value, "provider evidence item");
    const span = record(item.span, "provider evidence span");
    const start = nonNegativeInteger(span.start, "provider evidence span start");
    const end = nonNegativeInteger(span.end, "provider evidence span end");
    if (start > end) {
      throw new Error("Provider evidence span start exceeds end.");
    }
    return {
      sourceIndex: nonNegativeInteger(item.source_index, "provider evidence source_index"),
      span: { start, end },
    };
  });
  const method = choice(contribution.method, scoreMethods, "provider contribution method");
  if (method === "probabilistic") {
    throw new Error("Probabilistic provider contributions require a future prior and interval contract.");
  }
  if (method === "statistical" && sampleSize === undefined) {
    throw new Error("Statistical provider contribution requires sample_size.");
  }
  if (method !== "deterministic" && assumptions.length === 0) {
    throw new Error("Non-deterministic provider contribution requires assumptions.");
  }
  return {
    metric: choice(contribution.metric, providerMetrics, "provider metric"),
    value: nonNegativeFinite(contribution.value, "provider contribution value"),
    method,
    ...(sampleSize === undefined ? {} : { sampleSize }),
    assumptions,
    evidence,
    ...(fingerprint === undefined ? {} : { fingerprint }),
  };
}

function parseRefreshState(value: unknown): RefreshState {
  const refresh = record(value, "refresh state");
  const lastSuccess = optionalNonNegativeInteger(refresh.last_success, "refresh last_success");
  const error = optionalChoice(refresh.error, providerErrors, "refresh error");
  return {
    generation: nonNegativeInteger(refresh.generation, "refresh generation"),
    ...(lastSuccess === undefined ? {} : { lastSuccess }),
    health: choice(refresh.health, providerHealth, "refresh health"),
    ...(error === undefined ? {} : { error }),
  };
}

function parseFingerprint(value: unknown): readonly number[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const bytes = boundedList(value, "provider fingerprint", 32).map((byte) => {
    const parsed = nonNegativeInteger(byte, "provider fingerprint byte");
    if (parsed > 255) {
      throw new Error("Provider fingerprint byte exceeds 255.");
    }
    return parsed;
  });
  if (bytes.length !== 32) {
    throw new Error("Provider fingerprint must contain 32 bytes.");
  }
  return bytes;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
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
    throw new Error(`${label} exceeds its ${maximum.toLocaleString("en-US")}-item bound.`);
  }
  return values;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined || value === null ? undefined : string(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function nonNegativeFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const parsed = nonNegativeFinite(value, label);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return parsed;
}

function optionalNonNegativeInteger(value: unknown, label: string): number | undefined {
  return value === undefined || value === null ? undefined : nonNegativeInteger(value, label);
}

function protocolVersion(value: unknown, label: string): number {
  const version = nonNegativeInteger(value, label);
  if (version !== 1) {
    throw new Error(`Unsupported provider protocol schema version: ${version}.`);
  }
  return version;
}

function choice<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  const parsed = string(value, label);
  if (!allowed.includes(parsed)) {
    throw new Error(`Unsupported ${label}: ${parsed}.`);
  }
  return parsed as T[number];
}

function optionalChoice<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] | undefined {
  return value === undefined || value === null ? undefined : choice(value, allowed, label);
}

function choices<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
  maximum = 16,
): T[number][] {
  return boundedList(value, label, maximum).map((item) => choice(item, allowed, label));
}

function strings(value: unknown, label: string, maximum: number): string[] {
  return boundedList(value, label, maximum).map((item) => string(item, label));
}

function mapped<T>(
  value: unknown,
  label: string,
  maximum: number,
  parse: (value: unknown) => T,
): Record<string, T> {
  const source = record(value, label);
  if (Object.keys(source).length > maximum) {
    throw new Error(`${label} exceeds its ${maximum.toLocaleString("en-US")}-item bound.`);
  }
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, parse(item)]));
}

const providerErrors = [
  "invalid_provider", "not_found", "invalid_version", "configuration_error",
  "runtime_failure", "workspace_blocked", "timeout", "limit_exceeded",
  "invalid_report", "unsupported_installation", "consent_required",
] as const;
const providerAvailability = [
  "off", "available", "not_found", "invalid_version", "configuration_error",
  "runtime_failure", "blocked",
] as const;
const installationStatuses = ["built_in", "installed", "not_installed", "unknown"] as const;
const providerHealth = ["never_refreshed", "healthy", "stale", "failed", "disabled"] as const;
const providerCapabilities = [
  "deterministic_analysis", "lexical_similarity", "runtime_aggregates", "snapshots",
  "installation_planning",
] as const;
const configurationRequirements = ["executable", "runtime_mode", "snapshot_path"] as const;
const providerPlatforms = ["linux", "macos", "windows"] as const;
const scoreMethods = ["deterministic", "heuristic", "statistical", "probabilistic"] as const;
const providerMetrics = ["sources", "calls", "sessions", "cost_usd", "tokens"] as const;
const providerAssumptions = [
  "local_inventory", "runtime_aggregate_not_causal", "provider_window",
] as const;
