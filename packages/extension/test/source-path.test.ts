// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveReportSourcePath } from "../src/source-path.ts";

test("removes a Windows device prefix before creating a source URI", () => {
  assert.equal(
    resolveReportSourcePath(
      "\\\\?\\d:\\Git\\Repos\\harness-lens",
      "modules\\sdk",
      "win32",
    ),
    "d:\\Git\\Repos\\harness-lens\\modules\\sdk",
  );
});

test("resolves a regular workspace-relative source path", () => {
  assert.equal(
    resolveReportSourcePath("/workspace", "skills/example/SKILL.md", "linux"),
    "/workspace/skills/example/SKILL.md",
  );
  assert.equal(
    resolveReportSourcePath("/workspace", "..notes/SKILL.md", "linux"),
    "/workspace/..notes/SKILL.md",
  );
});

test("rejects paths outside the reported workspace", () => {
  assert.throws(
    () => resolveReportSourcePath("C:\\workspace", "..\\secret.txt", "win32"),
    /leaves the workspace root/,
  );
});
