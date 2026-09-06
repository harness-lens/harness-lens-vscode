// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import { existsSync } from "node:fs";
import { win32 } from "node:path";

export interface LanguageServerHost {
  platform: NodeJS.Platform;
  localAppData?: string;
  exists(path: string): boolean;
}

const defaultHost: LanguageServerHost = {
  platform: process.platform,
  ...(process.env.LOCALAPPDATA ? { localAppData: process.env.LOCALAPPDATA } : {}),
  exists: existsSync,
};

export function resolveLanguageServerCommand(
  configured: unknown,
  host: LanguageServerHost = defaultHost,
): string {
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  if (host.platform === "win32" && host.localAppData) {
    const installed = win32.join(
      host.localAppData,
      "HarnessLens",
      "bin",
      "harness-lens-lsp.exe",
    );
    if (host.exists(installed)) {
      return installed;
    }
  }
  return "harness-lens-lsp";
}
