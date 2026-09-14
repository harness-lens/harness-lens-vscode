// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

test("publishes only unambiguous local npm tarballs", () => {
  const localPatterns = workflow.match(
    /packages=\(\.\/artifacts\/harness-lens-vscode-\*\.tgz\)/g,
  );
  assert.equal(localPatterns?.length, 2);
  assert.doesNotMatch(
    workflow,
    /npm publish artifacts\/harness-lens-vscode-\*\.tgz/,
  );
  assert.match(workflow, /test "\$\{#packages\[@\]\}" -eq 1/);
  assert.match(workflow, /npm publish "\$\{packages\[0\]\}" --access public/);
});

test("recovers npm from checksum-verified release assets without rebuilding", () => {
  assert.match(workflow, /recover_existing_npm:/);
  assert.match(workflow, /gh release download "\$RELEASE_TAG" --dir artifacts/);
  assert.match(workflow, /working-directory: artifacts\n\s+run: sha256sum --check SHA256SUMS/);
  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch' && inputs\.recover_existing_npm/,
  );
});
