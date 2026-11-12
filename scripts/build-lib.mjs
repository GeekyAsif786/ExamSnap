// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers for scripts/build.mjs: no file system, no clock. Unit-tested
// in tests/build-lib.test.mjs.
import { createHash } from "node:crypto";
import { normalizeBase } from "./serve.mjs";
import { hasNotice } from "../src/ui/state.js";

export { normalizeBase };
export const DEFAULT_BASE = "/ExamSnap/";
export const DEFAULT_ORIGIN = "https://geekyasif786.github.io";
export const TITLE_MAX = 65;
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

/** Origin without a trailing slash. */
export function normalizeOrigin(origin = DEFAULT_ORIGIN) {
  const u = new URL(origin);
  return u.origin;
}

/** Absolute URL of `path` (relative to the site root) on the deployed site. */
export function siteUrl(origin, base, path = "") {
  return `${normalizeOrigin(origin)}${normalizeBase(base)}${path}`;
}

const HTML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escape text for HTML element content and quoted attribute values. */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESC[c]);
}

/**
 * Content-hashed file name: "src/ui/app.js" -> "src/ui/app.<8 hex>.js".
 * @param {string} path
 * @param {Uint8Array | string} content
 */
export function hashName(path, content) {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 8);
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  if (dot <= slash + 1) return `${path}.${hash}`;
  return `${path.slice(0, dot)}.${hash}${path.slice(dot)}`;
}

/** sha256 hex of several buffers/strings, in order. */
export function hashAll(parts) {
  const h = createHash("sha256");
  for (const p of parts) {
    h.update(String(p.length ?? 0));
    h.update(p);
  }
  return h.digest("hex");
}

// Static `import … from "./x.js"` / `export … from "./x.js"` and `import "./x.js"`.
const IMPORT_RE = /(\bfrom\s*|\bimport\s*)(["'])(\.{1,2}\/[^"']+)\2/g;

/** Relative module specifiers imported by `code`, in order, without duplicates. */
export function findImports(code) {
  const out = [];
  for (const m of code.matchAll(IMPORT_RE)) if (!out.includes(m[3])) out.push(m[3]);
  return out;
}

/** Replace relative module specifiers using `map(specifier) -> new specifier`. */
export function rewriteImports(code, map) {
  return code.replace(IMPORT_RE, (all, kw, q, spec) => `${kw}${q}${map(spec)}${q}`);
}

/** Resolve a relative specifier against the importing file's path ("a/b/c.js"). */
export function resolveSpecifier(fromPath, spec) {
  const parts = fromPath.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** Relative specifier from one file path to another ("src/ui/a.js" -> "src/core/b.js" = "../core/b.js"). */
export function relativeSpecifier(fromPath, toPath) {
  const from = fromPath.split("/").slice(0, -1);
  const to = toPath.split("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  const up = from.length - i;
  const rest = to.slice(i).join("/");
  return up === 0 ? `./${rest}` : `${"../".repeat(up)}${rest}`;
}

/**
 * Order modules so every module comes after the ones it imports.
 * @param {Record<string, string[]>} deps path -> resolved import paths
 * @returns {string[]}
 */
export function topoSort(deps) {
  const order = [];
  const state = new Map(); // path -> "visiting" | "done"
  const visit = (p, chain) => {
    if (state.get(p) === "done") return;
    if (state.get(p) === "visiting") throw new Error(`import cycle: ${[...chain, p].join(" -> ")}`);
    if (!(p in deps)) throw new Error(`unknown module ${p} (imported by ${chain.at(-1)})`);
    state.set(p, "visiting");
    for (const d of deps[p]) visit(d, [...chain, p]);
    state.set(p, "done");
    order.push(p);
  };
  for (const p of Object.keys(deps).sort()) visit(p, []);
  return order;
}

/** "SSC — CGL / CHSL" -> "SSC"; "JEE Main (NTA)" -> "JEE Main". */
export function shortName(name) {
  return name.split(/ — | \(/)[0].trim();
}

/**
 * Cut `text` to at most `max` chars at a word boundary, adding "…".
 * @returns {string}
 */
export function truncateWords(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:—–/-]+$/, "")}…`;
}

/**
 * <title> for an exam page, at most TITLE_MAX chars. Tries, in order: full
 * name + full template, short name + full template, full name + short
 * template, short name + short template; then truncates the last at a word
 * boundary.
 */
export function pageTitle(preset, S, max = TITLE_MAX) {
  const names = [preset.name, shortName(preset.name)];
  const candidates = [
    S.pageTitle(names[0]),
    S.pageTitle(names[1]),
    S.pageTitleShort(names[0]),
    S.pageTitleShort(names[1]),
  ];
  return candidates.find((t) => t.length <= max) ?? truncateWords(candidates.at(-1), max);
}

/** Noun for a document in running text: kind noun, or the label for "document". */
export function docNoun(doc, S) {
  const noun = S.kindNoun[doc.kind];
  if (noun) return noun;
  return doc.label.charAt(0).toLowerCase() + doc.label.slice(1);
}

/** "a", "a and b", "a, b and c" */
export function joinList(items, S) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(S.listComma)}${S.listAnd}${items.at(-1)}`;
}

/** Meta description from the preset's real specs. */
export function pageDescription(preset, S) {
  const parts = preset.documents.map((d) => S.descPart(docNoun(d, S), d.width, d.height, d.min_kb, d.max_kb));
  return S.pageDescription(shortName(preset.name), joinList(parts, S));
}

/** Static intro for an exam page: h1, warning, spec table. */
export function landingAboveHtml(preset, S) {
  const rows = preset.documents
    .map(
      (d) => `
            <tr>
              <th scope="row">${esc(d.label)}</th>
              <td>${esc(S.chipPixels(d.width, d.height))}</td>
              <td>${esc(S.chipKb(d.min_kb, d.max_kb))}</td>
              <td>${esc(d.notes ?? S.emptyCell)}</td>
            </tr>`,
    )
    .join("");
  const warning = hasNotice(preset) ? "" : `\n      <p class="warning">${esc(S.secondaryWarning)}</p>`;
  return `<section class="intro" aria-labelledby="page-title">
      <h1 id="page-title">${esc(S.landingHeading(preset.name))}</h1>${warning}
      <div class="table-wrap">
        <table class="spec-table">
          <caption>${esc(S.specTableCaption)}</caption>
          <thead>
            <tr><th scope="col">${esc(S.thDocument)}</th><th scope="col">${esc(S.thPixels)}</th><th scope="col">${esc(S.thKb)}</th><th scope="col">${esc(S.thNotes)}</th></tr>
          </thead>
          <tbody>${rows}
          </tbody>
        </table>
      </div>
    </section>`;
}

/** Static notes + sources for below the tool on an exam page. */
export function landingBelowHtml(preset, S) {
  const notes = preset.notes ? `\n      <p>${esc(preset.notes)}</p>` : "";
  const items = preset.sources
    .map(
      (s) => `
        <li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}<span class="visually-hidden"> ${esc(S.opensInNewTab)}</span></a> <span class="badge badge-${esc(s.type)}">${esc(S.sourceType[s.type])}</span></li>`,
    )
    .join("");
  return `<section class="page-sources" aria-labelledby="page-sources-title">
      <h2 id="page-sources-title">${esc(S.sourcesSummary)}</h2>${notes}
      <ul>${items}
      </ul>
      <p class="muted">${esc(S.lastVerified(preset.last_verified))}</p>
    </section>`;
}

/** Root page: links to every exam page (relative). */
export function examLinksHtml(presets, S) {
  const items = presets.map((p) => `\n        <li><a href="${esc(p.id)}/">${esc(p.name)}</a></li>`).join("");
  return `<section class="exam-links" aria-labelledby="exam-links-title">
      <h2 id="exam-links-title">${esc(S.examPagesHeading)}</h2>
      <ul>${items}
      </ul>
    </section>`;
}

/** JSON-LD WebApplication, safe to embed in a <script> element. */
export function jsonLd({ name, url, description }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    url,
    description,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  };
  return JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
}

/**
 * Meta tags for a page. `canonical` and `ogImage` are absolute URLs.
 * @returns {string}
 */
export function headTags({ description, canonical, title, ogImage, S, extra = [] }) {
  const meta = (attr, key, value) => `<meta ${attr}="${key}" content="${esc(value)}">`;
  return [
    meta("name", "description", description),
    `<link rel="canonical" href="${esc(canonical)}">`,
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", S.appName),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:url", canonical),
    meta("property", "og:image", ogImage),
    meta("property", "og:image:width", String(OG_IMAGE_SIZE.width)),
    meta("property", "og:image:height", String(OG_IMAGE_SIZE.height)),
    meta("property", "og:image:alt", S.ogImageAlt),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", description),
    meta("name", "twitter:image", ogImage),
    meta("name", "twitter:image:alt", S.ogImageAlt),
    ...extra,
    `<script type="application/ld+json">\n${jsonLd({ name: S.appName, url: canonical, description })}\n  </script>`,
  ].join("\n  ");
}

/** Fill empty elements carrying data-s="key" with the (escaped) string. */
export function fillDataStrings(html, S) {
  return html.replace(/(<(\w+)\b[^>]*\bdata-s="(\w+)"[^>]*>)(<\/\2>)/g, (all, open, tag, key, close) => {
    const v = S[key];
    if (typeof v !== "string") throw new Error(`data-s="${key}" is not a plain string in strings.js`);
    return `${open}${esc(v)}${close}`;
  });
}

/** Replace exactly one occurrence of `find`, or throw (guards template drift). */
export function replaceOnce(html, find, replacement) {
  const i = html.indexOf(find);
  if (i < 0 || html.indexOf(find, i + find.length) >= 0) {
    throw new Error(`build template: expected exactly one ${JSON.stringify(find)}`);
  }
  return html.slice(0, i) + replacement + html.slice(i + find.length);
}

/** sitemap.xml for [{ loc, lastmod }]. */
export function sitemapXml(entries) {
  const urls = entries
    .map((e) => `  <url>\n    <loc>${esc(e.loc)}</loc>\n    <lastmod>${esc(e.lastmod)}</lastmod>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(sitemapUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

/** Latest ISO date (YYYY-MM-DD) in the list. */
export function latestDate(dates) {
  return [...dates].sort().at(-1);
}

/** Sum of .js sizes, skipping paths that match `exclude`. */
export function jsBytes(files, exclude = /^src\/generated\//) {
  return files.filter((f) => f.path.endsWith(".js") && !exclude.test(f.path)).reduce((n, f) => n + f.size, 0);
}

/** Standalone 404 page. Asset URLs are root-absolute (the page is served at any path). */
export function notFoundHtml({ base, csp, css, favicon, S }) {
  const b = normalizeBase(base);
  return `<!doctype html>
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${csp}
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="noindex">
  <title>${esc(S.notFoundTitle)}</title>
  <link rel="icon" href="${esc(b + favicon)}" type="image/svg+xml">
  <link rel="stylesheet" href="${esc(b + css)}">
</head>
<body>
  <header class="site">
    <div class="wrap">
      <p class="brand"><a href="${esc(b)}">${esc(S.appName)}</a></p>
      <p class="tagline">${esc(S.tagline)}</p>
    </div>
  </header>
  <main class="wrap">
    <section class="step">
      <h1>${esc(S.notFoundHeading)}</h1>
      <p>${esc(S.notFoundBody)}</p>
      <p><a class="button primary" href="${esc(b)}">${esc(S.notFoundHome)}</a></p>
    </section>
  </main>
</body>
</html>
`;
}
