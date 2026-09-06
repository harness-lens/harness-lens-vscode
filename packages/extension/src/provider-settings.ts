// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

export type RuntimeMode = "off" | "live" | "snapshot";

export interface ProviderSettingValues {
  runtimeMode?: unknown;
  codeBurnEnabled?: unknown;
  executable?: unknown;
  period?: unknown;
  snapshotPath?: unknown;
  maxFiles?: unknown;
}

export interface ProviderConfigurationIssue {
  setting: string;
  message: string;
}

export interface ProviderSettings {
  requestedMode: RuntimeMode;
  runtimeMode: RuntimeMode;
  codeBurnEnabled: boolean;
  executable?: string;
  period?: string;
  snapshotPath?: string;
  maxFiles: number;
  issues: readonly ProviderConfigurationIssue[];
}

export interface WorkspacePolicy {
  workspaceTrusted: boolean;
  virtualWorkspace: boolean;
}

export interface ProviderInitializationOptions {
  harnessLens: {
    workspaceTrusted: boolean;
    virtualWorkspace: boolean;
    selectedProviders: readonly string[];
  };
}

const defaultMaxFiles = 5000;
const defaultPeriod = "30days";
const defaultExecutable = "codeburn";

export function resolveProviderSettings(values: ProviderSettingValues): ProviderSettings {
  const issues: ProviderConfigurationIssue[] = [];
  const requestedMode = parseMode(values.runtimeMode, issues);
  const codeBurnEnabled = values.codeBurnEnabled === true;
  let runtimeMode: RuntimeMode = codeBurnEnabled ? requestedMode : "off";
  const maxFiles = parseMaxFiles(values.maxFiles, issues);
  let executable: string | undefined;
  let period: string | undefined;
  let snapshotPath: string | undefined;

  if (runtimeMode === "live") {
    executable = nonEmpty(values.executable) ?? defaultExecutable;
    period = nonEmpty(values.period) ?? defaultPeriod;
    if (!validPeriod(period)) {
      issues.push({
        setting: "harnessLens.runtime.period",
        message: "CodeBurn period must use 1-64 ASCII letters, numbers, hyphens, or underscores.",
      });
      runtimeMode = "off";
      executable = undefined;
      period = undefined;
    }
  } else if (runtimeMode === "snapshot") {
    snapshotPath = nonEmpty(values.snapshotPath);
    if (!snapshotPath) {
      issues.push({
        setting: "harnessLens.runtime.snapshotPath",
        message: "Snapshot mode requires a canonical snapshot path.",
      });
      runtimeMode = "off";
    }
  }

  return {
    requestedMode,
    runtimeMode,
    codeBurnEnabled,
    ...(executable === undefined ? {} : { executable }),
    ...(period === undefined ? {} : { period }),
    ...(snapshotPath === undefined ? {} : { snapshotPath }),
    maxFiles,
    issues,
  };
}

export function providerInitializationOptions(
  settings: ProviderSettings,
  policy: WorkspacePolicy,
): ProviderInitializationOptions {
  return {
    harnessLens: {
      workspaceTrusted: policy.workspaceTrusted,
      virtualWorkspace: policy.virtualWorkspace,
      selectedProviders: settings.codeBurnEnabled ? ["codeburn"] : [],
    },
  };
}

export function runtimeEnvironment(
  base: NodeJS.ProcessEnv,
  settings: ProviderSettings,
): NodeJS.ProcessEnv {
  const environment = { ...base };
  delete environment.HARNESS_METRICS_CODEBURN_EXECUTABLE;
  delete environment.HARNESS_METRICS_CODEBURN_PERIOD;
  delete environment.HARNESS_METRICS_SNAPSHOT_PATH;
  environment.HARNESS_METRICS_MODE = settings.runtimeMode;
  if (settings.runtimeMode === "live") {
    environment.HARNESS_METRICS_CODEBURN_EXECUTABLE = settings.executable;
    environment.HARNESS_METRICS_CODEBURN_PERIOD = settings.period;
  } else if (settings.runtimeMode === "snapshot") {
    environment.HARNESS_METRICS_SNAPSHOT_PATH = settings.snapshotPath;
  }
  return environment;
}

export function codeBurnPolicyBlock(policy: WorkspacePolicy): string | undefined {
  if (!policy.workspaceTrusted) {
    return "Trust this workspace before enabling an optional provider.";
  }
  if (policy.virtualWorkspace) {
    return "CodeBurn is unavailable in virtual workspaces.";
  }
  return undefined;
}

function parseMode(
  value: unknown,
  issues: ProviderConfigurationIssue[],
): RuntimeMode {
  if (value === undefined || value === "off") {
    return "off";
  }
  if (value === "live" || value === "snapshot") {
    return value;
  }
  issues.push({
    setting: "harnessLens.runtime.mode",
    message: "Runtime mode must be off, live, or snapshot.",
  });
  return "off";
}

function parseMaxFiles(
  value: unknown,
  issues: ProviderConfigurationIssue[],
): number {
  if (value === undefined) {
    return defaultMaxFiles;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 50000) {
    return value;
  }
  issues.push({
    setting: "harnessLens.report.maxFiles",
    message: "Report file bound must be an integer from 1 through 50,000.",
  });
  return defaultMaxFiles;
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function validPeriod(value: string): boolean {
  return value.length <= 64 && /^[A-Za-z0-9_-]+$/.test(value);
}
