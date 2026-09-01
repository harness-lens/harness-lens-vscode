// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { classifyHarnessPath, discoverHarnessFiles } from "../src/index.ts";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { force: true, recursive: true })));
});

test("classifies supported harness paths", () => {
  assert.equal(classifyHarnessPath("AGENTS.md"), "agents");
  assert.equal(classifyHarnessPath("service\\CLAUDE.md"), "claude");
  assert.equal(classifyHarnessPath(".github/copilot-instructions.md"), "copilot");
  assert.equal(classifyHarnessPath(".cursor/rules/python.md"), "cursor-rule");
  assert.equal(classifyHarnessPath("README.md"), undefined);
});

test("discovers harness files and ignores dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-lens-vscode-"));
  temporaryRoots.push(root);

  await mkdir(join(root, "service"), { recursive: true });
  await mkdir(join(root, ".cursor", "rules"), { recursive: true });
  await mkdir(join(root, "node_modules", "fixture"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# Root\n");
  await writeFile(join(root, "service", "GEMINI.md"), "# Service\n");
  await writeFile(join(root, ".cursor", "rules", "typescript.md"), "# TypeScript\n");
  await writeFile(join(root, "node_modules", "fixture", "AGENTS.md"), "# Ignore\n");

  assert.deepEqual(await discoverHarnessFiles(root), [
    { kind: "cursor-rule", path: ".cursor/rules/typescript.md" },
    { kind: "agents", path: "AGENTS.md" },
    { kind: "gemini", path: "service/GEMINI.md" },
  ]);
});
