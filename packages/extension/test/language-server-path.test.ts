// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveLanguageServerCommand } from "../src/language-server-path.ts";

test("prefers explicit language-server configuration", () => {
  assert.equal(resolveLanguageServerCommand(" C:\\custom\\server.exe ", {
    platform: "win32",
    localAppData: "C:\\Users\\tester\\AppData\\Local",
    exists: () => true,
  }), "C:\\custom\\server.exe");
});

test("discovers the coordinated Windows installation", () => {
  const expected = "C:\\Users\\tester\\AppData\\Local\\HarnessLens\\bin\\harness-lens-lsp.exe";
  assert.equal(resolveLanguageServerCommand("", {
    platform: "win32",
    localAppData: "C:\\Users\\tester\\AppData\\Local",
    exists: (path) => path === expected,
  }), expected);
});

test("falls back to PATH when no coordinated installation exists", () => {
  assert.equal(resolveLanguageServerCommand(undefined, {
    platform: "win32",
    localAppData: "C:\\Users\\tester\\AppData\\Local",
    exists: () => false,
  }), "harness-lens-lsp");
  assert.equal(resolveLanguageServerCommand(undefined, {
    platform: "linux",
    exists: () => false,
  }), "harness-lens-lsp");
});
