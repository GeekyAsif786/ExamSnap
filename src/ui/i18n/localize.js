// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers for translated text; no DOM, so they are unit-tested and also
// used by the build.

/**
 * `own` strings with English filling every key it lacks (one level of nested
 * objects such as sourceType is merged key by key). A value of the wrong type
 * (e.g. a string where English has a function) also falls back.
 *
 * @param {Record<string, unknown>} own
 * @param {Record<string, unknown>} en
 * @returns {Record<string, unknown>}
 */
export function withFallback(own, en) {
  const out = {};
  for (const [key, value] of Object.entries(en)) {
    const mine = own?.[key];
    if (value && typeof value === "object") out[key] = withFallback(mine, value);
    else out[key] = typeof mine === typeof value ? mine : value;
  }
  return out;
}

/**
 * A preset with its `translations[code]` text (name, notes, document labels
 * and notes) in place of the English, which stays wherever a translation is
 * missing. The result has no `translations` field.
 *
 * @param {object} preset
 * @param {string} code locale code
 * @returns {object}
 */
export function localizePreset(preset, code) {
  const { translations, ...rest } = preset;
  const t = translations?.[code];
  if (!t) return rest;
  const out = { ...rest };
  if (t.name) out.name = t.name;
  if (t.notes && rest.notes) out.notes = t.notes;
  out.documents = rest.documents.map((d) => {
    const dt = t.documents?.[d.id];
    if (!dt) return d;
    return { ...d, ...(dt.label ? { label: dt.label } : {}), ...(dt.notes && d.notes ? { notes: dt.notes } : {}) };
  });
  return out;
}
