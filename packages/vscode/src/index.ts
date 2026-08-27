import { readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export type HarnessKind =
  | "agents"
  | "claude"
  | "copilot"
  | "cursor-rule"
  | "gemini";

export interface HarnessFile {
  kind: HarnessKind;
  path: string;
}

export interface DiscoveryOptions {
  ignoredDirectories?: Iterable<string>;
}

export const defaultIgnoredDirectories = Object.freeze([
  ".git",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "venv",
]);

const standardNames = new Map<string, HarnessKind>([
  ["AGENTS.md", "agents"],
  ["CLAUDE.md", "claude"],
  ["GEMINI.md", "gemini"],
]);

function segments(path: string): string[] {
  return path.replaceAll("\\", "/").split("/").filter(Boolean);
}

export function classifyHarnessPath(path: string): HarnessKind | undefined {
  const parts = segments(path);
  const name = parts.at(-1);
  if (!name) {
    return undefined;
  }

  const standard = standardNames.get(name);
  if (standard) {
    return standard;
  }

  if (parts.at(-2) === ".github" && name === "copilot-instructions.md") {
    return "copilot";
  }

  const cursorIndex = parts.lastIndexOf(".cursor");
  if (cursorIndex >= 0 && parts[cursorIndex + 1] === "rules" && parts.length > cursorIndex + 2) {
    return "cursor-rule";
  }

  return undefined;
}

export async function discoverHarnessFiles(
  root: string,
  options: DiscoveryOptions = {},
): Promise<readonly HarnessFile[]> {
  const absoluteRoot = resolve(root);
  const ignored = new Set(options.ignoredDirectories ?? defaultIgnoredDirectories);
  const matches: HarnessFile[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) {
          await walk(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = relative(absoluteRoot, absolutePath).split(sep).join("/");
      const kind = classifyHarnessPath(relativePath);
      if (kind) {
        matches.push({ kind, path: relativePath });
      }
    }
  }

  await walk(absoluteRoot);
  return matches.sort((left, right) => left.path.localeCompare(right.path));
}
