// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { validatePresets } from "../scripts/check-presets.mjs";

const fixture = (name) => fileURLToPath(new URL(`./fixtures/presets/${name}/`, import.meta.url));
const NOW = new Date("2026-11-12T00:00:00Z");

/** Validate a fixture dir and assert it has exactly one error matching `re`. */
async function expectOneError(name, re) {
  const { errors } = await validatePresets(fixture(name), { now: NOW });
  assert.equal(errors.length, 1, `expected 1 error, got:\n${errors.join("\n")}`);
  assert.match(errors[0], re);
  // Readable format: <file>: <path>: <message>
  assert.match(errors[0], /^\S+\.json: \/\S*: .+$/);
  return errors[0];
}

test("valid fixture passes with no warnings", async () => {
  assert.deepEqual(await validatePresets(fixture("valid"), { now: NOW }), { errors: [], warnings: [], count: 1 });
});

test("bad id pattern", async () => {
  await expectOneError("bad-id-pattern", /Bad_Id\.json: \/id: must match pattern/);
});

test("filename must match id", async () => {
  await expectOneError("filename-mismatch", /wrong-name\.json: \/id: file name must be "sample\.json"/);
});

test("duplicate document id", async () => {
  await expectOneError("duplicate-doc-id", /sample\.json: \/documents\/1\/id: duplicate document id "photo"/);
});

test("max_kb must be greater than min_kb", async () => {
  await expectOneError("max-not-greater", /\/documents\/1\/max_kb: max_kb \(10\) must be greater than min_kb \(10\)/);
});

test("non-https url", async () => {
  await expectOneError("non-https-url", /\/sources\/0\/url: must match pattern "\^https:\/\/"/);
});

test("unknown source type", async () => {
  await expectOneError("unknown-source-type", /\/sources\/0\/type: must be equal to one of the allowed values: "notice", "portal", "secondary"/);
});

test("extra property", async () => {
  await expectOneError("extra-property", /sample\.json: \/: unknown property "website"/);
});

test("duplicate preset id across files", async () => {
  const { errors } = await validatePresets(fixture("duplicate-preset-id"), { now: NOW });
  const dup = errors.filter((e) => e.includes('/id: duplicate preset id "sample"'));
  assert.equal(dup.length, 1, errors.join("\n"));
  assert.match(dup[0], /^\S+\/sample\.json: \/id: duplicate preset id "sample" \(also in \S+\/sample-copy\.json\)$/);
});

test("stale last_verified and missing notice are warnings, not errors", async () => {
  const { errors, warnings } = await validatePresets(fixture("stale-and-no-notice"), { now: NOW });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, [
    "sample: last_verified 2025-01-01 is older than 365 days",
    "sample: no official notice linked — specs unverified",
  ]);
});
