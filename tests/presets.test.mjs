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

test("reserved ids: custom, icons, src and every two-letter (language folder) id", async () => {
  const { errors } = await validatePresets(fixture("reserved-id"), { now: NOW });
  assert.deepEqual(errors.map((e) => e.replace(/^.*?(\w+\.json)/, "$1")), [
    'custom.json: /id: "custom" is reserved; choose another id',
    'hi.json: /id: "hi" is reserved: two-letter ids are language folders (like /hi/); choose another id',
  ]);
});

test("reservedIdReason", async () => {
  const { reservedIdReason } = await import("../scripts/check-presets.mjs");
  for (const id of ["custom", "icons", "src", "hi", "en", "bn", "zz"]) assert.ok(reservedIdReason(id), id);
  for (const id of ["ssc", "jee-main", "a1", "h", "neet-ug", "ib"+"ps"]) assert.equal(reservedIdReason(id), null, id);
});

test("translations: valid ones pass", async () => {
  assert.deepEqual((await validatePresets(fixture("translations-valid"), { now: NOW })).errors, []);
});

test("translations: unknown or default locale, unknown document, other fields, notes without English", async () => {
  await expectOneError("translation-unknown-locale", /\/translations\/fr: unknown locale "fr" \(known: hi; see src\/ui\/i18n\/locales\.js\)/);
  await expectOneError("translation-en", /\/translations\/en: unknown locale "en"/);
  await expectOneError("translation-unknown-doc", /\/translations\/hi\/documents\/thumb: unknown document id "thumb"/);
  await expectOneError("translation-extra-field", /\/translations\/hi: unknown property "category"/);
  await expectOneError("translation-doc-extra-field", /\/translations\/hi\/documents\/photo: unknown property "width"/);
  const { errors } = await validatePresets(fixture("translation-notes-without-english"), { now: NOW });
  assert.deepEqual(errors.map((e) => e.replace(/^\S+: /, "")), [
    "/translations/hi/notes: translated notes, but the English preset has no notes",
    "/translations/hi/documents/signature/notes: translated notes, but the English document has no notes",
  ]);
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

test("the real presets pass, with notice warnings for ssc and upsc-cse only", async () => {
  const dir = fileURLToPath(new URL("../presets/", import.meta.url));
  const { errors, warnings, count } = await validatePresets(dir);
  assert.deepEqual(errors, []);
  assert.equal(count, 6);
  assert.deepEqual(
    warnings.filter((w) => w.includes("no official notice")),
    ["ssc", "upsc-cse"].map((id) => `${id}: no official notice linked — specs unverified`),
  );
});

test("every real preset document yields a usable byte range", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { byteRange } = await import("../src/core/size.js");
  const dir = new URL("../presets/", import.meta.url);
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".json"))) {
    const preset = JSON.parse(await readFile(new URL(name, dir), "utf8"));
    for (const doc of preset.documents) {
      const r = byteRange(doc.min_kb, doc.max_kb);
      assert.ok(r.minBytes < r.maxBytes, `${preset.id}/${doc.id}`);
    }
  }
});

test("presets/ holds only preset JSON files and the CC0 LICENSE", async () => {
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(new URL("../presets/", import.meta.url));
  const unexpected = names.filter((n) => n !== "LICENSE" && !n.endsWith(".json"));
  assert.deepEqual(unexpected, []);
  assert.ok(!names.includes("schema.json"), "schema lives in schema/, not presets/");
});

test("javascript: source URLs are rejected", async () => {
  await expectOneError("javascript-url", /sample\.json: \/sources\/0\/url: must match pattern "\^https:\/\/"/);
});

test("data: source URLs are rejected", async () => {
  await expectOneError("data-url", /sample\.json: \/sources\/0\/url: must match pattern "\^https:\/\/"/);
});

test("the XSS fixture preset is schema-valid (so the XSS e2e test exercises a real-looking preset)", async () => {
  const { errors, warnings } = await validatePresets(fixture("xss"), { now: NOW });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, ["xss-test: no official notice linked — specs unverified"]);
});

test("NEET (UG) and CUET (UG): bulletin values exactly, official notices linked (M3c)", async () => {
  const { readFile } = await import("node:fs/promises");
  const load = async (id) => JSON.parse(await readFile(new URL(`../presets/${id}.json`, import.meta.url), "utf8"));
  const docs = (p) => p.documents.map((d) => [d.id, d.kind, d.width, d.height, d.min_kb, d.max_kb, d.filename]);
  const neet = await load("neet-ug");
  const cuet = await load("cuet-ug");
  assert.deepEqual(docs(neet), [
    ["photo", "photo", 276, 354, 10, 200, "photograph.jpg"],
    ["signature", "signature", 276, 118, 10, 100, "signature.jpg"],
    ["fingers", "thumb", 800, 500, 50, 200, "finger_thumb.jpg"],
  ]);
  assert.deepEqual(docs(cuet), [
    ["photo", "photo", 276, 354, 10, 200, "photograph.jpg"],
    ["signature", "signature", 276, 118, 10, 50, "signature.jpg"],
  ]);
  for (const p of [neet, cuet]) {
    assert.equal(p.category, "Entrance exams");
    assert.equal(p.last_verified, "2026-11-12");
    assert.deepEqual(p.sources.map((s) => s.type), ["notice", "portal"]);
    assert.match(p.sources[0].url, /^https:\/\/cdnbbsr\.s3waas\.gov\.in\/.+\.pdf$/);
    // Draft Hindi for the name, notes and every label and note.
    const hi = p.translations.hi;
    assert.ok(hi.name && hi.notes);
    for (const d of p.documents) {
      assert.ok(hi.documents[d.id].label, `${p.id}/${d.id} label`);
      if (d.notes) assert.ok(hi.documents[d.id].notes, `${p.id}/${d.id} notes`);
    }
  }
  assert.equal(cuet.documents[1].notes, undefined, "CUET signature has no notes");
});

test("JEE Main: 2027 bulletin values exactly, official notice and portal only", async () => {
  const { readFile } = await import("node:fs/promises");
  const jee = JSON.parse(await readFile(new URL("../presets/jee-main.json", import.meta.url), "utf8"));
  assert.equal(jee.name, "JEE Main (NTA)");
  assert.equal(jee.category, "Entrance exams");
  assert.equal(jee.last_verified, "2026-11-12");
  assert.deepEqual(
    jee.documents.map((d) => [d.id, d.kind, d.width, d.height, d.min_kb, d.max_kb, d.filename]),
    [
      ["photo", "photo", 276, 354, 10, 200, "Photograph.jpg"],
      ["signature", "signature", 276, 118, 10, 100, "Signature.jpg"],
    ],
  );
  assert.equal(jee.documents[1].notes, undefined, "signature has no notes");
  assert.deepEqual(jee.sources, [
    {
      title: "JEE (Main) 2027 Information Bulletin — NTA (Application Form, p. 8)",
      url: "https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2026/10/202610241890224107.pdf",
      type: "notice",
    },
    { title: "JEE Main official site", url: "https://jeemain.nta.nic.in", type: "portal" },
  ]);
  const hi = jee.translations.hi;
  assert.match(hi.notes, /^JEE \(Main\) 2027 /);
  assert.ok(hi.documents.photo.notes && hi.documents.photo.label && hi.documents.signature.label);
  assert.equal(hi.documents.signature.notes, undefined);
});
