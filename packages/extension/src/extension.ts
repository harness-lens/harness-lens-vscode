// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import {
  classifyHarnessPath,
  type HarnessKind,
} from "@harness-lens/vscode";
import * as vscode from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";
import { ObservabilityCenter } from "./center.js";
import { resolveLanguageServerCommand } from "./language-server-path.js";
import {
  ProviderProtocolService,
  type ProviderStatus,
} from "./provider-service.js";
import {
  codeBurnPolicyBlock,
  providerInitializationOptions,
  resolveProviderSettings,
  runtimeEnvironment,
  type ProviderSettings,
  type WorkspacePolicy,
} from "./provider-settings.js";

const harnessDocumentPatterns = [
  "**/AGENTS.md",
  "**/AGENTS.override.md",
  "**/CLAUDE.md",
  "**/CLAUDE.local.md",
  "**/GEMINI.md",
  "**/SKILL.md",
  "**/.agents/rules/**/*.{md,mdc,rules}",
  "**/.claude/agents/**/*.md",
  "**/.claude/rules/**/*.{md,mdc}",
  "**/.github/agents/**/*.agent.md",
  "**/.github/copilot-instructions.md",
  "**/.github/instructions/**/*.instructions.md",
  "**/.codex/agents/**/*.toml",
  "**/.codex/config.toml",
  "**/.codex/rules/**/*.rules",
  "**/.cursor/rules/**",
] as const;
const excludePattern = "{**/.git/**,**/.venv/**,**/build/**,**/dist/**,**/node_modules/**,**/venv/**}";
const refreshRuntimeCommand = "harnessMetrics.refreshCodeBurn";

interface WorkspaceHarnessFile {
  kind: HarnessKind;
  uri: vscode.Uri;
}

let languageClient: LanguageClient | undefined;
let languageServerStart: Promise<void> | undefined;
let serverFailureReported = false;
let providerConfigurationIssueReported: string | undefined;

function workspacePolicy(): WorkspacePolicy {
  return {
    workspaceTrusted: vscode.workspace.isTrusted,
    virtualWorkspace: vscode.workspace.workspaceFolders
      ?.some((folder) => folder.uri.scheme !== "file") ?? false,
  };
}

function providerSettings(resource: vscode.Uri): ProviderSettings {
  const configuration = vscode.workspace.getConfiguration("harnessLens", resource);
  return resolveProviderSettings({
    runtimeMode: configuration.get<unknown>("runtime.mode"),
    codeBurnEnabled: configuration.get<unknown>("providers.codeburn.enabled"),
    executable: configuration.get<unknown>("runtime.executable"),
    period: configuration.get<unknown>("runtime.period"),
    snapshotPath: configuration.get<unknown>("runtime.snapshotPath"),
    maxFiles: configuration.get<unknown>("report.maxFiles"),
  });
}

async function reportProviderConfigurationIssues(settings: ProviderSettings): Promise<void> {
  const signature = settings.issues
    .map((issue) => `${issue.setting}:${issue.message}`)
    .join("|");
  if (!signature) {
    providerConfigurationIssueReported = undefined;
    return;
  }
  if (providerConfigurationIssueReported === signature) {
    return;
  }
  providerConfigurationIssueReported = signature;
  const issue = settings.issues[0]!;
  const action = await vscode.window.showWarningMessage(
    `Harness Lens rejected configuration safely: ${issue.message}`,
    "Open Settings",
  );
  if (action === "Open Settings") {
    await vscode.commands.executeCommand("workbench.action.openSettings", issue.setting);
  }
}

async function scanWorkspace(): Promise<readonly WorkspaceHarnessFile[]> {
  const matches = await Promise.all(
    harnessDocumentPatterns.map((pattern) => vscode.workspace.findFiles(pattern, excludePattern)),
  );
  const uris = new Map(matches.flat().map((uri) => [uri.toString(), uri])).values();
  return [...uris]
    .flatMap((uri) => {
      const kind = classifyHarnessPath(vscode.workspace.asRelativePath(uri));
      return kind ? [{ kind, uri }] : [];
    })
    .sort((left, right) => left.uri.path.localeCompare(right.uri.path));
}

function kindLabel(kind: HarnessKind): string {
  return {
    agent: "Agent profile",
    agents: "AGENTS",
    claude: "Claude",
    "codex-config": "Codex config",
    copilot: "Copilot",
    "cursor-rule": "Cursor rule",
    gemini: "Gemini",
    rule: "Agent rule",
    skill: "Agent Skill",
  }[kind];
}

function isHarnessDocument(document: vscode.TextDocument): boolean {
  return document.uri.scheme === "file"
    && classifyHarnessPath(document.uri.fsPath) !== undefined;
}

async function stopLanguageServer(): Promise<void> {
  const client = languageClient;
  languageClient = undefined;
  if (client) {
    await client.stop();
  }
}

function ensureLanguageServer(context: vscode.ExtensionContext): Promise<void> {
  if (languageServerStart) {
    return languageServerStart;
  }
  if (languageClient) {
    return Promise.resolve();
  }

  const filesystemRoot = vscode.workspace.workspaceFolders
    ?.find((folder) => folder.uri.scheme === "file");
  if (!filesystemRoot) {
    return Promise.resolve();
  }
  const configuration = vscode.workspace.getConfiguration("harnessLens", filesystemRoot.uri);
  if (!configuration.get<boolean>("languageServer.enabled", true)
      || !vscode.workspace.isTrusted) {
    return Promise.resolve();
  }

  languageServerStart = (async () => {
    const command = resolveLanguageServerCommand(
      configuration.get<unknown>("languageServer.path"),
    );
    const args = configuration.get<readonly string[]>(
      "languageServer.arguments",
      [],
    );
    const settings = providerSettings(filesystemRoot.uri);
    await reportProviderConfigurationIssues(settings);
    const environment = runtimeEnvironment(process.env, settings);
    const serverOptions: ServerOptions = {
      command,
      args: [...args],
      options: { cwd: filesystemRoot.uri.fsPath, env: environment },
    };
    const clientOptions: LanguageClientOptions = {
      documentSelector: harnessDocumentPatterns.map((pattern) => ({
        scheme: "file",
        pattern,
      })),
      initializationOptions: providerInitializationOptions(settings, workspacePolicy()),
      outputChannelName: "Harness Lens Language Server",
    };
    const client = new LanguageClient(
      "harnessLens",
      "Harness Lens",
      serverOptions,
      clientOptions,
    );
    languageClient = client;
    context.subscriptions.push(client);

    try {
      await client.start();
      serverFailureReported = false;
    } catch (error: unknown) {
      languageClient = undefined;
      if (!serverFailureReported) {
        serverFailureReported = true;
        const detail = error instanceof Error ? error.message : String(error);
        const action = await vscode.window.showWarningMessage(
          `Harness Lens could not start ${command}: ${detail}`,
          "Open Settings",
        );
        if (action === "Open Settings") {
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "harnessLens.languageServer.path",
          );
        }
      }
    }
  })().finally(() => {
    languageServerStart = undefined;
  });

  return languageServerStart;
}

export function activate(context: vscode.ExtensionContext): Readonly<{
  scanWorkspace: typeof scanWorkspace;
}> {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "harnessLens.scanWorkspace";
  status.name = "Harness Lens";

  const refreshStatus = async (): Promise<readonly WorkspaceHarnessFile[]> => {
    const files = await scanWorkspace();
    status.text = `$(search) Harness Lens: ${files.length}`;
    status.tooltip = `${files.length} harness file(s). Select to inspect.`;
    status.show();
    return files;
  };

  const scanCommand = vscode.commands.registerCommand("harnessLens.scanWorkspace", async () => {
    const files = await refreshStatus();
    if (files.length === 0) {
      await vscode.window.showInformationMessage("Harness Lens found no harness files in this workspace.");
      return;
    }

    const items = files.map((file) => ({
      description: kindLabel(file.kind),
      file,
      label: vscode.workspace.asRelativePath(file.uri),
    }));
    const selection = await vscode.window.showQuickPick(items, {
      matchOnDescription: true,
      placeHolder: `${files.length} harness file(s) found`,
      title: "Harness Lens",
    });

    if (selection) {
      await vscode.window.showTextDocument(selection.file.uri);
    }
  });

  const enableCodeBurn = vscode.commands.registerCommand(
    "harnessLens.enableCodeBurn",
    async () => {
      const folder = vscode.window.activeTextEditor
        ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
        : vscode.workspace.workspaceFolders?.find((candidate) => candidate.uri.scheme === "file");
      if (!folder || folder.uri.scheme !== "file") {
        await vscode.window.showWarningMessage("Open a filesystem workspace before enabling CodeBurn.");
        return;
      }
      const policyBlock = codeBurnPolicyBlock(workspacePolicy());
      if (policyBlock) {
        await vscode.window.showWarningMessage(policyBlock);
        return;
      }
      const configuration = vscode.workspace.getConfiguration("harnessLens", folder.uri);
      if (configuration.get<boolean>("providers.codeburn.enabled", false)) {
        await vscode.window.showInformationMessage("CodeBurn provider is already enabled for this VS Code window.");
        return;
      }
      await ensureLanguageServer(context);
      const client = languageClient;
      if (!client) {
        await vscode.window.showWarningMessage(
          "Start a compatible Harness Lens language server before enabling CodeBurn.",
        );
        return;
      }
      let codeBurn: ProviderStatus;
      try {
        const catalog = await new ProviderProtocolService(
          (method, parameters) => client.sendRequest(method, parameters),
        ).catalog();
        if (catalog.issue) {
          throw new Error(`Language server rejected provider selection: ${catalog.issue}.`);
        }
        const provider = catalog.providers.find(
          (candidate) => candidate.descriptor.id === "codeburn",
        );
        if (
          !provider
          || !provider.descriptor.optional
          || !provider.descriptor.capabilities.includes("runtime_aggregates")
        ) {
          throw new Error("Language server catalog does not expose optional CodeBurn support.");
        }
        codeBurn = provider;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        await vscode.window.showWarningMessage(`Cannot enable CodeBurn: ${detail}`);
        return;
      }
      const providerVersion = codeBurn.descriptor.version
        ? ` ${codeBurn.descriptor.version}`
        : "";
      const providerLicense = codeBurn.descriptor.license ?? "license not reported";
      const action = await vscode.window.showWarningMessage(
        `Enable ${codeBurn.descriptor.displayName}${providerVersion} for this VS Code window? Catalog reports ${providerLicense} and ${codeBurn.installation.replaceAll("_", " ")}. Live mode may launch its separately installed executable. Harness Lens never installs or bundles it.`,
        { modal: true },
        "Enable Provider",
      );
      if (action !== "Enable Provider") {
        return;
      }
      await configuration.update(
        "providers.codeburn.enabled",
        true,
        vscode.ConfigurationTarget.Workspace,
      );
      await vscode.window.showInformationMessage(
        "CodeBurn provider enabled. Runtime remains off until live or snapshot mode is selected.",
      );
    },
  );

  const observability = new ObservabilityCenter(context, async (folder) => {
    await ensureLanguageServer(context);
    const client = languageClient;
    if (!client) {
      throw new Error("Language server is disabled, unavailable, or workspace is not trusted.");
    }
    const service = new ProviderProtocolService(
      (method, parameters) => client.sendRequest(method, parameters),
    );
    const response = await service.aggregate(
      folder.uri.toString(),
      providerSettings(folder.uri).maxFiles,
    );
    return {
      schemaVersion: response.schemaVersion,
      reports: [response.native],
      runtime: response.runtime,
    };
  });
  const openCenter = vscode.commands.registerCommand(
    "harnessLens.openCenter",
    () => observability.show(),
  );
  const refreshObservability = vscode.commands.registerCommand(
    "harnessLens.refreshObservability",
    () => observability.refresh(true),
  );
  const refreshRuntime = vscode.commands.registerCommand(
    "harnessLens.refreshRuntime",
    async () => {
      await ensureLanguageServer(context);
      const client = languageClient;
      if (!client) {
        throw new Error("Language server is disabled, unavailable, or workspace is not trusted.");
      }
      const folder = vscode.window.activeTextEditor
        ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
        : vscode.workspace.workspaceFolders?.find((candidate) => candidate.uri.scheme === "file");
      const settings = folder ? providerSettings(folder.uri) : undefined;
      if (!settings || settings.runtimeMode === "off") {
        const action = await vscode.window.showInformationMessage(
          "Optional runtime evidence is off. Enable CodeBurn and select live or snapshot mode first.",
          "Open Settings",
        );
        if (action === "Open Settings") {
          await vscode.commands.executeCommand("workbench.action.openSettings", "harnessLens.runtime");
        }
        return;
      }
      await vscode.commands.executeCommand(refreshRuntimeCommand);
      await observability.refresh(false);
    },
  );
  const openSource = vscode.commands.registerCommand(
    "harnessLens.openSource",
    (target: { path: string; line?: number }) => observability.openSource(target),
  );

  const restart = vscode.commands.registerCommand(
    "harnessLens.restartLanguageServer",
    async () => {
      await stopLanguageServer();
      serverFailureReported = false;
      await ensureLanguageServer(context);
      await observability.refresh(false);
    },
  );

  const documents = vscode.workspace.onDidOpenTextDocument((document) => {
    if (isHarnessDocument(document)) {
      void ensureLanguageServer(context);
    }
  });
  const trust = vscode.workspace.onDidGrantWorkspaceTrust(() => {
    if (vscode.workspace.textDocuments.some(isHarnessDocument)) {
      void ensureLanguageServer(context);
    }
  });
  const configuration = vscode.workspace.onDidChangeConfiguration((event) => {
    if (
      event.affectsConfiguration("harnessLens.languageServer")
      || event.affectsConfiguration("harnessLens.runtime")
      || event.affectsConfiguration("harnessLens.providers")
    ) {
      void stopLanguageServer().then(() => ensureLanguageServer(context));
    }
  });
  const harnessFiles = harnessDocumentPatterns.map((pattern) =>
    vscode.workspace.createFileSystemWatcher(pattern)
  );
  const refreshForFileChange = (): void => {
    void refreshStatus().then((files) => {
      if (files.length > 0) {
        return ensureLanguageServer(context).then(() => observability.refresh(false));
      }
      return undefined;
    });
  };
  for (const watcher of harnessFiles) {
    watcher.onDidCreate(refreshForFileChange);
    watcher.onDidDelete(refreshForFileChange);
  }

  context.subscriptions.push(
    scanCommand,
    enableCodeBurn,
    openCenter,
    refreshObservability,
    refreshRuntime,
    openSource,
    restart,
    documents,
    trust,
    configuration,
    ...harnessFiles,
    observability,
    status,
  );
  void refreshStatus().then((files) => {
    if (files.length > 0) {
      return ensureLanguageServer(context).then(() => observability.refresh(false));
    }
    return undefined;
  });

  return Object.freeze({ scanWorkspace });
}

export async function deactivate(): Promise<void> {
  await stopLanguageServer();
}
