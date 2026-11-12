// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers for scripts/build.mjs: no file system, no clock. Unit-tested
// in tests/build-lib.test.mjs.
import { createHash } from "node:crypto";
import { normalizeBase } from "./serve.mjs";
import { hasNotice } from "../src/ui/state.js";

export { normalizeBase };
export const DEFAULT_BASE = "/";
export const DEFAULT_ORIGIN = "https://examsnap.asifurrahaman.com";
/** The request-exam issue form; the app adds custom specs to it at runtime. */
export const REQUEST_EXAM_URL = "https://github.com/GeekyAsif786/ExamSnap/issues/new?template=request-exam.yml&title=%5BExam%5D%20";
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

// `import … from "./x.js"`, `export … from "./x.js"`, `import "./x.js"` and
// dynamic `import("./x.js")` with a literal specifier.
const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"']+)\2/g;

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

/** "Photo 276×354 px, 20–50 KB · Signature 472×157 px, 10–20 KB" */
export function docSummary(preset, S) {
  return preset.documents
    .map((d) => {
      const noun = docNoun(d, S);
      return S.summaryPart(noun.charAt(0).toUpperCase() + noun.slice(1), d.width, d.height, d.min_kb, d.max_kb);
    })
    .join(S.summarySep);
}

/** True if an exam page shows the secondary-sources warning above the tool. */
export const hasPageWarning = (preset) => !hasNotice(preset);

/**
 * Above the tool on an exam page: kept short so the tool starts on the first
 * screen of a phone. h1, a one-line document summary, and the warning.
 */
export function landingAboveHtml(preset, S) {
  const warning = hasPageWarning(preset) ? `\n      <p id="page-warning" class="warning">${esc(S.secondaryWarning)}</p>` : "";
  return `<section class="intro" aria-labelledby="page-title">
      <h1 id="page-title">${esc(S.landingHeading(preset.name))}</h1>
      <p class="summary">${esc(docSummary(preset, S))}</p>${warning}
    </section>`;
}

/** Full spec table, server-rendered for crawlers. */
export function specTableHtml(preset, S) {
  const rows = preset.documents
    .map(
      (d) => `
            <tr>
              <th scope="row">${esc(d.label)}</th>
              <td data-label="${esc(S.thPixels)}">${esc(S.chipPixels(d.width, d.height))}</td>
              <td data-label="${esc(S.thKb)}">${esc(S.chipKb(d.min_kb, d.max_kb))}</td>
              <td data-label="${esc(S.thNotes)}"${d.notes ? "" : ' class="empty"'}>${esc(d.notes ?? S.emptyCell)}</td>
            </tr>`,
    )
    .join("");
  return `<section class="page-specs" aria-labelledby="page-specs-title">
      <h2 id="page-specs-title">${esc(S.specTableCaption)}</h2>
      <div class="table-wrap">
        <table class="spec-table" aria-labelledby="page-specs-title">
          <thead>
            <tr><th scope="col">${esc(S.thDocument)}</th><th scope="col">${esc(S.thPixels)}</th><th scope="col">${esc(S.thKb)}</th><th scope="col">${esc(S.thNotes)}</th></tr>
          </thead>
          <tbody>${rows}
          </tbody>
        </table>
      </div>
    </section>`;
}

/** Below the tool on an exam page: the spec table, then notes + sources. */
export function landingBelowHtml(preset, S) {
  const notes = preset.notes ? `\n      <p>${esc(preset.notes)}</p>` : "";
  const items = preset.sources
    .map(
      (s) => `
        <li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}<span class="visually-hidden"> ${esc(S.opensInNewTab)}</span></a> <span class="badge badge-${esc(s.type)}">${esc(S.sourceType[s.type])}</span></li>`,
    )
    .join("");
  return `${specTableHtml(preset, S)}
    <section class="page-sources" aria-labelledby="page-sources-title">
      <h2 id="page-sources-title">${esc(S.sourcesSummary)}</h2>${notes}
      <ul>${items}
      </ul>
      <p class="muted">${esc(S.lastVerified(preset.last_verified))}</p>
    </section>`;
}

/** Root page: links to every exam page (relative). role="list" because the
    list has no markers in CSS, which makes Safari drop its list semantics. */
export function examLinksHtml(presets, S) {
  const items = presets.map((p) => `\n        <li><a href="${esc(p.id)}/">${esc(p.name)}</a></li>`).join("");
  return `<section class="exam-links" aria-labelledby="exam-links-title">
      <h2 id="exam-links-title">${esc(S.examPagesHeading)}</h2>
      <ul role="list">${items}
      </ul>
    </section>`;
}

/** JSON-LD WebApplication, safe to embed in a <script> element. */
export function jsonLd({ name, url, description, inLanguage }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    url,
    description,
    inLanguage,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  };
  return JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
}

/**
 * Meta tags for a page. `canonical`, `ogImage` and alternate hrefs are
 * absolute URLs; `alternates` lists the same page in every language.
 * @param {{ description: string, canonical: string, title: string, ogImage: string, S: object, lang: string,
 *   alternates?: { hreflang: string, href: string }[], extra?: string[] }} o
 * @returns {string}
 */
export function headTags({ description, canonical, title, ogImage, S, lang, alternates = [], extra = [] }) {
  const meta = (attr, key, value) => `<meta ${attr}="${key}" content="${esc(value)}">`;
  return [
    meta("name", "description", description),
    `<link rel="canonical" href="${esc(canonical)}">`,
    ...alternates.map((a) => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}">`),
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
    `<script type="application/ld+json">\n${jsonLd({ name: S.appName, url: canonical, description, inLanguage: lang })}\n  </script>`,
  ].join("\n  ");
}

/** Fill empty elements carrying data-s="key" with the (escaped) string. */
export function fillDataStrings(html, S) {
  return html.replace(/(<(\w+)\b[^>]*\bdata-s="(\w+)"[^>]*>)(<\/\2>)/g, (all, open, tag, key, close) => {
    const v = S[key];
    if (typeof v !== "string") throw new Error(`data-s="${key}" is not a plain string in the locale strings`);
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

export const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
export const XHTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * sitemap.xml for [{ loc, lastmod, alternates? }]; each alternate
 * ({ hreflang, href }) becomes an xhtml:link, the format search engines read
 * for language versions.
 */
export function sitemapXml(entries) {
  const urls = entries
    .map((e) => {
      const links = (e.alternates ?? [])
        .map((a) => `\n    <xhtml:link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}"/>`)
        .join("");
      return `  <url>\n    <loc>${esc(e.loc)}</loc>\n    <lastmod>${esc(e.lastmod)}</lastmod>${links}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NS}" xmlns:xhtml="${XHTML_NS}">\n${urls}\n</urlset>\n`;
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
export function notFoundHtml({ base, css, favicon, S }) {
  const b = normalizeBase(base);
  return `<!doctype html>
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${cspMeta()}
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
  <footer class="site">
    <div class="wrap">
      <ul class="links">
        <li><a href="${esc(REQUEST_EXAM_URL)}" target="_blank" rel="noopener noreferrer">${esc(S.footerRequest)} <span class="visually-hidden">${esc(S.opensInNewTab)}</span></a></li>
      </ul>
    </div>
  </footer>
</body>
</html>
`;
}

// Same colours as src/ui/styles.css (light theme).
export const THEME_COLOR = "#1d4ed8";
export const BACKGROUND_COLOR = "#f6f6f3";

/**
 * Web app manifest. Icon paths are relative to the manifest (site root).
 * @param {{ S: object, base: string, icons: { any192: string, any512: string, maskable512: string } }} o
 */
export function manifestJson({ S, base, icons }) {
  const b = normalizeBase(base);
  const manifest = {
    name: S.appName,
    short_name: S.appName,
    description: S.tagline,
    id: b,
    start_url: b,
    scope: b,
    display: "standalone",
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    icons: [
      { src: icons.any192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icons.any512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icons.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Cache name: "examsnap-" + 12 hex of a hash over the precached URLs and their bytes. */
export function cacheName(entries) {
  return `examsnap-${hashAll(entries.flatMap(([url, data]) => [url, data])).slice(0, 12)}`;
}

/** dist/sw.js = this generated header + src/sw/sw.js. */
export function swSource({ cache, precache, body }) {
  return `// GENERATED by scripts/build.mjs from src/sw/sw.js. Do not edit.
// SPDX-License-Identifier: AGPL-3.0-or-later
const CACHE = ${JSON.stringify(cache)};
const PRECACHE = ${JSON.stringify(precache, null, 2)};

${body.replace(/^\/\/ SPDX-License-Identifier:.*\n/, "")}`;
}

/**
 * Content-Security-Policy for every built page (meta tag; GitHub Pages
 * can't send headers). `upgrade-insecure-requests` is deliberately absent:
 * WebKit applies it even to http://localhost and http://127.0.0.1, which
 * breaks local preview and e2e, and it adds nothing here because every URL
 * is relative or https and Pages enforces HTTPS. The compensating control
 * is findInsecureUrls(), which fails the build on any http:// URL.
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function cspMeta() {
  return `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
}

// Text outputs that can carry URLs. (SVG images are not scanned: their
// xmlns="http://www.w3.org/2000/svg" is a namespace name, not a fetch.)
const URL_SCANNED = /\.(html|css|js|webmanifest|xml|txt|json)$/;
// Namespace identifiers that are never fetched.
const ALLOWED_HTTP = { "sitemap.xml": [SITEMAP_NS, XHTML_NS] };

/**
 * Every http:// URL in the built text files, except allowed namespaces.
 * @param {{ path: string, text: string }[]} files
 * @returns {string[]} "path: url"
 */
export function findInsecureUrls(files) {
  const found = [];
  for (const { path, text } of files) {
    if (!URL_SCANNED.test(path)) continue;
    const allowed = ALLOWED_HTTP[path] ?? [];
    for (const m of text.matchAll(/http:\/\/[^\s"'<>)\\`]*/gi)) {
      if (!allowed.includes(m[0])) found.push(`${path}: ${m[0]}`);
    }
  }
  return found;
}

// ---- Languages -----------------------------------------------------------

/** A locale's strings module: src/ui/i18n/<two letters>.js. */
export const LOCALE_MODULE_RE = /^src\/ui\/i18n\/([a-z]{2})\.js$/;

/** URL folder of a locale relative to the site root: "" for the default, "hi/" otherwise. */
export function localeDir(code, defaultCode = "en") {
  return code === defaultCode ? "" : `${code}/`;
}

/**
 * The same page in every built locale, plus x-default (the default locale),
 * as absolute URLs. `page` is the page's path inside a locale folder ("" or "ssc/").
 * @returns {{ hreflang: string, href: string }[]}
 */
export function alternatesFor(page, { locales, origin, base, defaultCode = "en" }) {
  const href = (code) => siteUrl(origin, base, `${localeDir(code, defaultCode)}${page}`);
  return [...locales.map((l) => ({ hreflang: l.code, href: href(l.code) })), { hreflang: "x-default", href: href(defaultCode) }];
}

/**
 * Header links to the same page in each other language. Plain relative links
 * (`prefix` leads back to the site root); the app keeps ?exam=/?doc= on them.
 * @param {{ current: string, locales: { code: string, name: string }[], page: string, prefix: string, S: object, defaultCode?: string }} o
 */
export function langSwitchHtml({ current, locales, page, prefix, S, defaultCode = "en" }) {
  const others = locales.filter((l) => l.code !== current);
  if (!others.length) return "";
  const links = others
    .map((l) => `<a href="${esc(`${prefix}${localeDir(l.code, defaultCode)}${page}` || "./")}" hreflang="${esc(l.code)}" lang="${esc(l.code)}" data-lang-switch>${esc(l.name)}</a>`)
    .join(" ");
  return `<nav class="lang" aria-label="${esc(S.languageNav)}">${links}</nav>`;
}

/**
 * Shipped JS per page, by locale: every .js file except src/generated/ and
 * the locale modules, plus that locale's own module (a page loads only its
 * own language).
 * @param {{ path: string, size: number }[]} files
 * @param {string[]} codes
 * @returns {Record<string, number>}
 */
export function jsBytesByLocale(files, codes) {
  const locale = (f) => LOCALE_MODULE_RE.exec(f.path.replace(/\.[0-9a-f]{8}\.js$/, ".js"))?.[1];
  const common = jsBytes(files.filter((f) => !locale(f)));
  return Object.fromEntries(codes.map((c) => [c, common + jsBytes(files.filter((f) => locale(f) === c))]));
}

/**
 * Remove comment-only lines from shipped JS: lines that are just a // comment,
 * and /* … *\/ blocks that start a line and end one. Comments after code
 * stay. The first line is kept if it is the SPDX licence header. A line can
 * only start with // or /* outside a comment inside a multi-line template
 * literal, which src/ never has (tests/build.test.mjs compares tokens).
 * @param {string} code
 */
export function stripComments(code) {
  const spdx = /^\/\/ SPDX-License-Identifier:.*\n/.exec(code)?.[0] ?? "";
  return (
    spdx +
    code
      .slice(spdx.length)
      .replace(/^[ \t]*\/\*(?:[^*]|\*(?!\/))*\*\/[ \t]*\n/gm, "")
      .replace(/^[ \t]*\/\/.*\n/gm, "")
  );
}
