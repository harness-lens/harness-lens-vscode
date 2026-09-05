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

interface WorkspaceHarnessFile {
  kind: HarnessKind;
  uri: vscode.Uri;
}

let languageClient: LanguageClient | undefined;
let languageServerStart: Promise<void> | undefined;
let serverFailureReported = false;

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

  const configuration = vscode.workspace.getConfiguration("harnessLens");
  if (!configuration.get<boolean>("languageServer.enabled", true)
      || !vscode.workspace.isTrusted) {
    return Promise.resolve();
  }

  const filesystemRoot = vscode.workspace.workspaceFolders
    ?.find((folder) => folder.uri.scheme === "file");
  if (!filesystemRoot) {
    return Promise.resolve();
  }

  languageServerStart = (async () => {
    const command = configuration.get<string>(
      "languageServer.path",
      "harness-lens-lsp",
    );
    const args = configuration.get<readonly string[]>(
      "languageServer.arguments",
      [],
    );
    const serverOptions: ServerOptions = {
      command,
      args: [...args],
      options: { cwd: filesystemRoot.uri.fsPath },
    };
    const clientOptions: LanguageClientOptions = {
      documentSelector: harnessDocumentPatterns.map((pattern) => ({
        scheme: "file",
        pattern,
      })),
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

  const command = vscode.commands.registerCommand("harnessLens.scanWorkspace", async () => {
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

  const restart = vscode.commands.registerCommand(
    "harnessLens.restartLanguageServer",
    async () => {
      await stopLanguageServer();
      serverFailureReported = false;
      await ensureLanguageServer(context);
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
    if (event.affectsConfiguration("harnessLens.languageServer")) {
      void stopLanguageServer().then(() => ensureLanguageServer(context));
    }
  });
  const harnessFiles = harnessDocumentPatterns.map((pattern) =>
    vscode.workspace.createFileSystemWatcher(pattern)
  );
  const refreshForFileChange = (): void => {
    void refreshStatus().then((files) => {
      if (files.length > 0) {
        return ensureLanguageServer(context);
      }
      return undefined;
    });
  };
  for (const watcher of harnessFiles) {
    watcher.onDidCreate(refreshForFileChange);
    watcher.onDidDelete(refreshForFileChange);
  }

  context.subscriptions.push(
    command,
    restart,
    documents,
    trust,
    configuration,
    ...harnessFiles,
    status,
  );
  void refreshStatus().then((files) => {
    if (files.length > 0) {
      return ensureLanguageServer(context);
    }
    return undefined;
  });

  return Object.freeze({ scanWorkspace });
}

export async function deactivate(): Promise<void> {
  await stopLanguageServer();
}
