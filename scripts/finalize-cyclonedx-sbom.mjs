// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const URL_NAMESPACE = "6ba7b8119dad11d180b400c04fd430c8";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

function uuidV5(name) {
  const namespace = Buffer.from(URL_NAMESPACE, "hex");
  const bytes = createHash("sha1").update(namespace).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function finalizeCycloneDxSbom(input) {
  if (
    input?.bomFormat !== "CycloneDX"
    || typeof input.specVersion !== "string"
    || input.version !== 1
  ) {
    throw new Error("Expected a CycloneDX JSON document with version 1");
  }

  const unsigned = structuredClone(input);
  delete unsigned.serialNumber;
  const serialNumber = `urn:uuid:${uuidV5(JSON.stringify(stable(unsigned)))}`;
  const { $schema, bomFormat, specVersion, ...rest } = unsigned;
  return { $schema, bomFormat, specVersion, serialNumber, ...rest };
}

export async function finalizeFile(path) {
  const input = JSON.parse(await readFile(path, "utf8"));
  const output = finalizeCycloneDxSbom(input);
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
}

const invokedPath = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (invokedPath === import.meta.url) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) throw new Error("Pass at least one CycloneDX JSON path");
  await Promise.all(paths.map(finalizeFile));
}
