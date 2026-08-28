import { readFile } from "node:fs/promises";

async function readPackage(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

const root = await readPackage("../package.json");
const library = await readPackage("../packages/vscode/package.json");
const extension = await readPackage("../packages/extension/package.json");
const versions = new Set([root.version, library.version, extension.version]);

if (versions.size !== 1) {
  throw new Error(
    `Version mismatch: root=${root.version}, npm=${library.version}, extension=${extension.version}`,
  );
}

const tag = process.env.GITHUB_REF_NAME;
const isVersionTag = tag && /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag);
if (isVersionTag) {
  const tagVersion = tag.startsWith("v") ? tag.slice(1) : tag;
  if (tagVersion !== root.version) {
    throw new Error(`Tag ${tag} does not match package version ${root.version}`);
  }
}

console.log(`Versions match: ${root.version}`);
