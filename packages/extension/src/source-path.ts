// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import { posix, win32 } from "node:path";

function windowsPathWithoutDevicePrefix(path: string): string {
  if (/^[\\/]{2}\?[\\/]UNC[\\/]/i.test(path)) {
    return `\\\\${path.slice(8)}`;
  }
  if (/^[\\/]{2}\?[\\/]/.test(path)) {
    return path.slice(4);
  }
  return path;
}

export function resolveReportSourcePath(
  root: string,
  target: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const path = platform === "win32" ? win32 : posix;
  const normalizedRoot = platform === "win32"
    ? windowsPathWithoutDevicePrefix(root)
    : root;
  const candidate = path.resolve(normalizedRoot, target);
  const child = path.relative(path.resolve(normalizedRoot), candidate);
  if (child === ".." || child.startsWith(`..${path.sep}`) || path.isAbsolute(child)) {
    throw new Error("Harness report path leaves the workspace root.");
  }
  return candidate;
}
