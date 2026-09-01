// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import {
  classifyHarnessPath,
  type HarnessKind,
} from "@harness-lens/vscode";
import * as vscode from "vscode";

const includePattern = "{**/AGENTS.md,**/CLAUDE.md,**/GEMINI.md,**/.github/copilot-instructions.md,**/.cursor/rules/**}";
const excludePattern = "{**/.git/**,**/.venv/**,**/build/**,**/dist/**,**/node_modules/**,**/venv/**}";

interface WorkspaceHarnessFile {
  kind: HarnessKind;
  uri: vscode.Uri;
}

async function scanWorkspace(): Promise<readonly WorkspaceHarnessFile[]> {
  const uris = await vscode.workspace.findFiles(includePattern, excludePattern);
  return uris
    .map((uri) => ({
      kind: classifyHarnessPath(vscode.workspace.asRelativePath(uri)) ?? "agents",
      uri,
    }))
    .sort((left, right) => left.uri.path.localeCompare(right.uri.path));
}

function kindLabel(kind: HarnessKind): string {
  return {
    agents: "AGENTS",
    claude: "Claude",
    copilot: "Copilot",
    "cursor-rule": "Cursor rule",
    gemini: "Gemini",
  }[kind];
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

  context.subscriptions.push(command, status);
  void refreshStatus();

  return Object.freeze({ scanWorkspace });
}

export function deactivate(): void {}
