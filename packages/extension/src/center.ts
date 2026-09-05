// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import { randomBytes } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import * as vscode from "vscode";

import {
  aggregateMetric,
  appendSnapshot,
  assetSummaries,
  classifyTrend,
  parseWorkspaceReports,
  snapshot,
  type AnalysisReport,
  type HistorySnapshot,
} from "./center-model.js";
import { centerHtml, type CenterViewState } from "./center-view.js";

const historyPrefix = "harnessLens.observability.history";

export type ReportRequester = (folder: vscode.WorkspaceFolder) => Promise<unknown>;

class ObservationItem extends vscode.TreeItem {
  readonly children: readonly ObservationItem[];

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    children: readonly ObservationItem[] = [],
  ) {
    super(label, collapsibleState);
    this.children = children;
  }
}

class ObservationTree implements vscode.TreeDataProvider<ObservationItem> {
  private readonly changed = new vscode.EventEmitter<ObservationItem | undefined>();
  private report: AnalysisReport | undefined;
  private history: readonly HistorySnapshot[] = [];

  readonly onDidChangeTreeData = this.changed.event;

  dispose(): void {
    this.changed.dispose();
  }

  update(report: AnalysisReport | undefined, history: readonly HistorySnapshot[]): void {
    this.report = report;
    this.history = history;
    this.changed.fire(undefined);
  }

  getTreeItem(element: ObservationItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ObservationItem): ObservationItem[] {
    if (element) {
      return [...element.children];
    }
    if (!this.report) {
      const item = new ObservationItem(
        "Open metrics center",
        vscode.TreeItemCollapsibleState.None,
      );
      item.command = { command: "harnessLens.openCenter", title: "Open Metrics Center" };
      item.iconPath = new vscode.ThemeIcon("dashboard");
      return [item];
    }

    const report = this.report;
    const trend = classifyTrend(this.history);
    const tokens = aggregateMetric(report, "harness.total_estimated_tokens");
    const overview = [
      leaf("Open metrics center", "dashboard", "harnessLens.openCenter"),
      leaf(`${report.completeness.complete ? "Complete" : "Partial"} coverage`, report.completeness.complete ? "pass" : "warning"),
      leaf(`${report.sources.length} harness files`, "files"),
      leaf(tokens === null ? "Context cost not measured" : `${Math.round(tokens)} estimated tokens`, "symbol-numeric"),
      leaf(`${trend.state.replace("_", " ")}: ${trend.reason}`, trend.state === "degrading" ? "warning" : "pulse"),
    ];
    const files = assetSummaries(report).map((asset) => {
      const item = new ObservationItem(asset.path, vscode.TreeItemCollapsibleState.None);
      item.description = `${asset.estimatedTokens === null ? "—" : Math.round(asset.estimatedTokens)} tokens · ${asset.findings} findings`;
      item.tooltip = `${asset.bytes} bytes\nStatic input cost: ${asset.inputCostPerInvocation ?? "not measured"}\nEffectiveness: not measured`;
      item.iconPath = new vscode.ThemeIcon(asset.kind === "skills" || asset.kind === "skill" ? "tools" : "file-code");
      item.command = {
        command: "harnessLens.openSource",
        title: "Open Harness File",
        arguments: [{ path: asset.path, line: 1 }],
      };
      return item;
    });
    const findings = report.findings
      .filter((finding) => finding.severity !== "pass")
      .map((finding) => {
        const item = new ObservationItem(
          `${finding.rule_id}: ${finding.message}`,
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = finding.path ?? "workspace";
        item.tooltip = finding.evidence ?? finding.message;
        item.iconPath = new vscode.ThemeIcon(
          finding.severity === "error" ? "error" : finding.severity === "warning" ? "warning" : "info",
        );
        if (finding.path) {
          item.command = {
            command: "harnessLens.openSource",
            title: "Open Finding",
            arguments: [{ path: finding.path, line: finding.line ?? 1 }],
          };
        }
        return item;
      });
    const runtime = [
      leaf("Tool-call history: not measured", "history"),
      leaf("Cost per tool call: not measured", "credit-card"),
      leaf("Requires sanitized runtime trace", "shield"),
    ];

    return [
      group("Overview", "dashboard", overview),
      group("Files and instructions", "files", files),
      group("Findings", "issues", findings),
      group("Tool-call runtime", "pulse", runtime),
    ];
  }
}

function leaf(label: string, icon: string, command?: string): ObservationItem {
  const item = new ObservationItem(label, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon(icon);
  if (command) {
    item.command = { command, title: label };
  }
  return item;
}

function group(label: string, icon: string, children: readonly ObservationItem[]): ObservationItem {
  const item = new ObservationItem(label, vscode.TreeItemCollapsibleState.Expanded, children);
  item.iconPath = new vscode.ThemeIcon(icon);
  return item;
}

function messageRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export class ObservabilityCenter implements vscode.Disposable {
  private readonly tree = new ObservationTree();
  private readonly treeView: vscode.TreeView<ObservationItem>;
  private panel: vscode.WebviewPanel | undefined;
  private state: CenterViewState = { history: [] };
  private folder: vscode.WorkspaceFolder | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly requestReport: ReportRequester,
  ) {
    this.treeView = vscode.window.createTreeView("harnessLens.observability", {
      treeDataProvider: this.tree,
      showCollapseAll: true,
    });
  }

  dispose(): void {
    this.panel?.dispose();
    this.treeView.dispose();
    this.tree.dispose();
  }

  async show(): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "harnessLens.center",
        "Harness Lens Metrics",
        vscode.ViewColumn.One,
        { enableScripts: true, localResourceRoots: [] },
      );
      this.panel.onDidDispose(() => { this.panel = undefined; });
      this.panel.webview.onDidReceiveMessage((value: unknown) => {
        const message = messageRecord(value);
        if (message?.type === "refresh") {
          void this.refresh(true);
        } else if (message?.type === "open" && typeof message.path === "string") {
          void this.openSource({
            path: message.path,
            line: typeof message.line === "number" ? message.line : 1,
          });
        }
      });
    } else {
      this.panel.reveal();
    }
    this.render();
    await this.refresh(true);
  }

  async refresh(recordHistory = true): Promise<void> {
    const folder = vscode.window.activeTextEditor
      ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
      : vscode.workspace.workspaceFolders?.[0];
    if (!folder || folder.uri.scheme !== "file") {
      this.state = { history: [], error: "Open a filesystem workspace to analyze harness files." };
      this.tree.update(undefined, []);
      this.render();
      return;
    }

    this.folder = folder;
    try {
      const response = parseWorkspaceReports(await this.requestReport(folder));
      const report = response.reports[0];
      if (!report) {
        throw new Error("Language server returned no report for this workspace.");
      }
      const key = `${historyPrefix}:${folder.uri.toString()}`;
      let history = this.context.workspaceState.get<HistorySnapshot[]>(key, []);
      if (recordHistory) {
        history = appendSnapshot(history, snapshot(report));
        await this.context.workspaceState.update(key, history);
      }
      this.state = { report, history };
      this.tree.update(report, history);
      this.treeView.description = folder.name;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.state = { history: [], error: detail };
      this.tree.update(undefined, []);
      if (recordHistory) {
        void vscode.window.showWarningMessage(`Harness Lens report unavailable: ${detail}`);
      }
    }
    this.render();
  }

  async openSource(target: { path: string; line?: number }): Promise<void> {
    const report = this.state.report;
    if (!report || !this.folder) {
      return;
    }
    const root = resolve(report.root);
    const candidate = resolve(root, target.path);
    const child = relative(root, candidate);
    if (!child || child.startsWith("..") || isAbsolute(child)) {
      throw new Error("Harness report path leaves the workspace root.");
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(candidate));
    const editor = await vscode.window.showTextDocument(document);
    const line = Math.max(0, Math.min(document.lineCount - 1, (target.line ?? 1) - 1));
    const selection = new vscode.Selection(line, 0, line, 0);
    editor.selection = selection;
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private render(): void {
    if (!this.panel) {
      return;
    }
    this.panel.webview.html = centerHtml(this.state, randomBytes(18).toString("base64url"));
  }
}
