// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

import {
  aggregateMetric,
  appendSnapshot,
  assetSummaries,
  classifyTrend,
  snapshot,
  type AnalysisReport,
  type HistorySnapshot,
  type RuntimeStatus,
  type WorkspaceReports,
} from "./center-model.js";
import { centerHtml, type CenterViewState } from "./center-view.js";
import { resolveReportSourcePath } from "./source-path.js";

const historyPrefix = "harnessLens.observability.history";

export type ReportRequester = (folder: vscode.WorkspaceFolder) => Promise<WorkspaceReports>;

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
  private runtime: RuntimeStatus | undefined;

  readonly onDidChangeTreeData = this.changed.event;

  dispose(): void {
    this.changed.dispose();
  }

  update(
    report: AnalysisReport | undefined,
    history: readonly HistorySnapshot[],
    runtime?: RuntimeStatus,
  ): void {
    this.report = report;
    this.history = history;
    this.runtime = runtime;
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
    const assets = assetSummaries(report);
    const fileItems = assets.map((asset) => {
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
    const skillItems = assets
      .filter((asset) => asset.kind === "skills" || asset.kind === "skill")
      .map((asset) => {
        const item = new ObservationItem(asset.path, vscode.TreeItemCollapsibleState.None);
        item.description = `scope ${asset.scope}`;
        item.tooltip = "Deterministic discovery provenance";
        item.iconPath = new vscode.ThemeIcon("tools");
        item.command = {
          command: "harnessLens.openSource",
          title: "Open Skill",
          arguments: [{ path: asset.path, line: 1 }],
        };
        return item;
      });
    const referenceItems = report.inclusions
      .filter((edge) => edge.source !== undefined)
      .map((edge) => {
        const item = new ObservationItem(
          `${edge.source} → ${edge.target}`,
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = `${edge.status} · depth ${edge.depth}`;
        item.tooltip = [
          `Method: ${edge.method}`,
          ...edge.assumptions.map((assumption) => `Assumption: ${assumption}`),
        ].join("\n");
        item.iconPath = new vscode.ThemeIcon(
          edge.status === "resolved"
            ? "references"
            : edge.status === "cycle"
              ? "sync"
              : "warning",
        );
        if (edge.status === "resolved" || edge.status === "cycle") {
          item.command = {
            command: "harnessLens.openSource",
            title: "Open Referenced File",
            arguments: [{ path: edge.target, line: 1 }],
          };
        }
        return item;
      });
    if (skillItems.length === 0) {
      skillItems.push(leaf("No skills discovered", "info"));
    }
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
    const context = [
      leaf(tokens === null ? "Estimated tokens: not measured" : `${Math.round(tokens)} estimated tokens`, "symbol-numeric"),
      leaf("Method: heuristic Unicode scalar count / 4", "beaker"),
      leaf(`${report.completeness.complete ? "Complete" : "Partial"} discovery coverage`, report.completeness.complete ? "pass" : "warning"),
      leaf(`${trend.state.replace("_", " ")}: ${trend.reason}`, trend.state === "degrading" ? "warning" : "pulse"),
    ];
    const runtimeStatus = this.runtime;
    const runtime = runtimeStatus
      ? [
          leaf(`Mode: ${runtimeStatus.mode}`, "settings"),
          leaf(
            `Status: ${runtimeStatus.state}${runtimeStatus.hasSnapshot ? " · snapshot available" : ""}`,
            runtimeStatus.state === "ready" ? "pass" : runtimeStatus.state === "off" ? "circle-slash" : "warning",
          ),
          leaf(`${runtimeStatus.calls} calls · ${runtimeStatus.sessions} sessions`, "pulse"),
          ...(runtimeStatus.issue ? [leaf(`Error class: ${runtimeStatus.issue}`, "warning")] : []),
          leaf("Tool-call history: not measured", "history"),
        ]
      : [
          leaf("Runtime status unavailable from server", "circle-slash"),
          leaf("Tool-call history: not measured", "history"),
        ];

    return [
      group("Workspace assets", "files", [
        leaf("Open metrics center", "dashboard", "harnessLens.openCenter"),
        ...fileItems,
      ]),
      group("Skills and references", "references", [...skillItems, ...referenceItems]),
      group("Findings", "issues", findings),
      group("Context consumption", "symbol-numeric", context),
      group("Runtime history", "pulse", runtime),
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
        } else if (message?.type === "runtime-settings") {
          void vscode.commands.executeCommand("workbench.action.openSettings", "harnessLens.runtime");
        } else if (message?.type === "refresh-runtime") {
          void vscode.commands.executeCommand("harnessLens.refreshRuntime").then(undefined, () => {
            void vscode.window.showWarningMessage("Runtime evidence is unavailable. Check runtime settings and language-server status.");
          });
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
      const response = await this.requestReport(folder);
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
      this.state = { report, history, runtime: response.runtime };
      this.tree.update(report, history, response.runtime);
      this.treeView.description = folder.name;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.state = { ...this.state, error: detail };
      this.tree.update(this.state.report, this.state.history, this.state.runtime);
      this.treeView.description = this.state.report ? "Previous report · refresh failed" : "Report unavailable";
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
    const candidate = resolveReportSourcePath(report.root, target.path);
    const uri = vscode.Uri.file(candidate);
    const stat = await vscode.workspace.fs.stat(uri);
    if ((stat.type & vscode.FileType.Directory) !== 0) {
      await vscode.commands.executeCommand("revealInExplorer", uri);
      return;
    }
    const document = await vscode.workspace.openTextDocument(uri);
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
