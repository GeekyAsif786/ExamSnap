// SPDX-License-Identifier: AGPL-3.0-or-later
// Every UI language. `code` is the <html lang> value and the URL folder
// (/hi/); English is the default and lives at the site root. A "draft"
// locale may be incomplete and is not built into dist/; a "published" one
// must cover 100% of en.js (npm run check fails otherwise). Its strings
// live in src/ui/i18n/<code>.js.
export const DEFAULT_LOCALE = "en";

export const LOCALES = [
  { code: "en", name: "English", dir: "ltr", status: "published" },
  { code: "hi", name: "हिन्दी", dir: "ltr", status: "published" },
];
