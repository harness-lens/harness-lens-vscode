// SPDX-License-Identifier: MPL-2.0
// Copyright © 2026 Cristian Camargo Filho

import assert from "node:assert/strict";
import test from "node:test";

import { finalizeCycloneDxSbom } from "./finalize-cyclonedx-sbom.mjs";

const fixture = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: { component: { type: "library", name: "harness-lens", version: "0.0.2" } },
  components: [],
};

test("adds a stable UUIDv5 serial required by GitHub attestation", () => {
  const first = finalizeCycloneDxSbom(fixture);
  const second = finalizeCycloneDxSbom(first);

  assert.deepEqual(second, first);
  assert.match(
    first.serialNumber,
    /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("changes the serial when SBOM content changes", () => {
  const first = finalizeCycloneDxSbom(fixture);
  const second = finalizeCycloneDxSbom({
    ...fixture,
    metadata: { component: { ...fixture.metadata.component, version: "0.0.3" } },
  });

  assert.notEqual(second.serialNumber, first.serialNumber);
});

test("rejects an unrelated JSON document", () => {
  assert.throws(() => finalizeCycloneDxSbom({ version: 1 }), /Expected a CycloneDX/);
});
