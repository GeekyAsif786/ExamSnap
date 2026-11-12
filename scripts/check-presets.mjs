// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCHEMA_PATH = join(ROOT, "presets", "schema.json");
const STALE_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

let validateSchema;
async function getValidator() {
  if (!validateSchema) {
    const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    validateSchema = ajv.compile(schema);
  }
  return validateSchema;
}

/** Turn one ajv error into a readable message. */
function describe(err) {
  switch (err.keyword) {
    case "additionalProperties":
      return `unknown property "${err.params.additionalProperty}"`;
    case "enum":
      return `${err.message}: ${err.params.allowedValues.map((v) => JSON.stringify(v)).join(", ")}`;
    case "required":
      return `missing required property "${err.params.missingProperty}"`;
    default:
      return err.message;
  }
}

/**
 * Validate every *.json preset in `dir` (except schema.json).
 *
 * @param {string} dir
 * @param {{ now?: Date }} [options] `now` is used for the staleness warning.
 * @returns {Promise<{ errors: string[], warnings: string[], count: number }>}
 *   errors are `<file>: <path>: <message>`.
 */
export async function validatePresets(dir, { now = new Date() } = {}) {
  const validate = await getValidator();
  const errors = [];
  const warnings = [];
  const seenIds = new Map(); // preset id -> file

  const names = (await readdir(dir)).filter((n) => n.endsWith(".json") && n !== "schema.json").sort();

  for (const name of names) {
    const path = join(dir, name);
    const file = relative(process.cwd(), path) || name;
    const err = (p, msg) => errors.push(`${file}: ${p || "/"}: ${msg}`);

    let data;
    try {
      data = JSON.parse(await readFile(path, "utf8"));
    } catch (e) {
      err("/", `invalid JSON: ${e.message}`);
      continue;
    }

    if (!validate(data)) {
      for (const e of validate.errors) err(e.instancePath, describe(e));
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) continue;

    const { id } = data;
    if (typeof id === "string") {
      if (name !== `${id}.json`) {
        err("/id", `file name must be "${id}.json" to match the id`);
      }
      if (seenIds.has(id)) {
        err("/id", `duplicate preset id "${id}" (also in ${seenIds.get(id)})`);
      } else {
        seenIds.set(id, file);
      }
    }

    if (Array.isArray(data.documents)) {
      const docIds = new Map();
      data.documents.forEach((doc, i) => {
        if (!doc || typeof doc !== "object") return;
        if (typeof doc.id === "string") {
          if (docIds.has(doc.id)) {
            err(`/documents/${i}/id`, `duplicate document id "${doc.id}" (also /documents/${docIds.get(doc.id)})`);
          } else {
            docIds.set(doc.id, i);
          }
        }
        if (typeof doc.min_kb === "number" && typeof doc.max_kb === "number" && !(doc.max_kb > doc.min_kb)) {
          err(`/documents/${i}/max_kb`, `max_kb (${doc.max_kb}) must be greater than min_kb (${doc.min_kb})`);
        }
      });
    }

    const label = typeof id === "string" ? id : file;
    if (typeof data.last_verified === "string") {
      const verified = Date.parse(`${data.last_verified}T00:00:00Z`);
      if (!Number.isNaN(verified) && now.getTime() - verified > STALE_DAYS * DAY_MS) {
        warnings.push(`${label}: last_verified ${data.last_verified} is older than ${STALE_DAYS} days`);
      }
    }
    if (Array.isArray(data.sources) && !data.sources.some((s) => s && s.type === "notice")) {
      warnings.push(`${label}: no official notice linked — specs unverified`);
    }
  }

  return { errors, warnings, count: names.length };
}

async function main() {
  const dir = join(ROOT, "presets");
  const { errors, warnings, count } = await validatePresets(dir);
  for (const w of warnings) console.warn(`WARN  ${w}`);
  for (const e of errors) console.error(`ERROR ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} error(s) in ${count} preset(s).`);
    process.exit(1);
  }
  console.log(`${count} preset(s) OK, ${warnings.length} warning(s).`);
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  await main();
}
