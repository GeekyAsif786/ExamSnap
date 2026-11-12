// SPDX-License-Identifier: AGPL-3.0-or-later
// The page's UI strings, in its own language only. <html lang> picks the
// locale; built pages also name its content-hashed module on
// <html data-strings>, so each page downloads exactly one language. A draft
// locale (only ever seen in development) falls back to English per key.
import { DEFAULT_LOCALE, LOCALES } from "./i18n/locales.js";
import { withFallback } from "./i18n/localize.js";

const root = document.documentElement;
const locale = LOCALES.find((l) => l.code === root.lang) ?? LOCALES.find((l) => l.code === DEFAULT_LOCALE);
const own = (
  await (root.dataset.strings
    ? import(new URL(root.dataset.strings, document.baseURI).href)
    : import(`./i18n/${locale.code}.js`))
).STRINGS;

/** The page's locale code, e.g. "hi". */
export const LOCALE = locale.code;
export const STRINGS = locale.status === "published" ? own : withFallback(own, (await import("./i18n/en.js")).STRINGS);
