// SPDX-License-Identifier: AGPL-3.0-or-later
// Build the deployable site into dist/: content-hashed assets, for every
// published language a root page and one landing page per preset (English
// at /, others under /<code>/), sitemap, robots, 404. No bundler and no
// minifier; comment-only lines are dropped from shipped JS.
//   BASE_PATH      URL prefix the site is served under (default /)
//   SITE_ORIGIN    origin for absolute URLs (default https://examsnap.asifurrahaman.com)
//   INCLUDE_DRAFTS 1 also builds draft locales (for translators' previews;
//                  never set by CI or deploy)
// Deterministic: same inputs, byte-identical output.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_BASE,
  DEFAULT_ORIGIN,
  esc,
  examLinksHtml,
  fillDataStrings,
  hasPageWarning,
  findImports,
  hashName,
  headTags,
  landingAboveHtml,
  landingBelowHtml,
  cacheName,
  cspMeta,
  findInsecureUrls,
  latestDate,
  alternatesFor,
  jsBytesByLocale,
  langSwitchHtml,
  localeDir,
  LOCALE_MODULE_RE,
  stripComments,
  manifestJson,
  normalizeBase,
  swSource,
  THEME_COLOR,
  notFoundHtml,
  pageDescription,
  pageTitle,
  relativeSpecifier,
  replaceOnce,
  resolveSpecifier,
  rewriteImports,
  robotsTxt,
  siteUrl,
  sitemapXml,
  topoSort,
} from "./build-lib.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const JS_BUDGET = 60_000;

const toPosix = (p) => p.split(sep).join("/");

async function walk(dir, root) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, root)));
    else out.push(toPosix(relative(root, p)));
  }
  return out.sort();
}

/**
 * @param {{ root?: string, outDir?: string, base?: string, origin?: string, includeDrafts?: boolean }} [options]
 * @returns {Promise<{ files: { path: string, size: number }[], totalBytes: number, jsBytes: number,
 *   jsByLocale: Record<string, number>, locales: string[], pages: string[], assets: Record<string, string> }>}
 *   jsBytes is the largest per-page figure; pages are paths like "", "ssc/", "hi/", "hi/ssc/".
 */
export async function build({ root = ROOT, outDir, base = DEFAULT_BASE, origin = DEFAULT_ORIGIN, includeDrafts = false } = {}) {
  base = normalizeBase(base);
  outDir ??= join(root, "dist");
  const mod = (p) => import(pathToFileURL(join(root, p)).href);
  const { PRESETS } = await mod("src/generated/presets.js");
  const { LOCALES, DEFAULT_LOCALE } = await mod("src/ui/i18n/locales.js");
  const { localizePreset, withFallback } = await mod("src/ui/i18n/localize.js");
  const locales = LOCALES.filter((l) => l.status === "published" || includeDrafts);
  const built = new Set(locales.map((l) => l.code));
  const { STRINGS: EN } = await mod(`src/ui/i18n/${DEFAULT_LOCALE}.js`);
  /** code -> strings (published locales are complete; drafts fall back to English) */
  const strings = {};
  for (const l of locales) strings[l.code] = withFallback((await mod(`src/ui/i18n/${l.code}.js`)).STRINGS, EN);

  /** @type {Map<string, Uint8Array | string>} output path -> content */
  const out = new Map();
  /** original path -> hashed output path */
  const assets = {};

  // Static assets: hashed by content.
  const statics = ["favicon.svg", "src/ui/styles.css", ...(await walk(join(root, "icons"), root)).filter((p) => p.endsWith(".png"))];
  for (const p of statics) {
    const data = await readFile(join(root, p));
    assets[p] = hashName(p, data);
    out.set(assets[p], data);
  }

  // JS modules: rewrite relative imports to hashed names, leaves first.
  // src/sw/ is the service worker source, emitted separately as dist/sw.js.
  // Locale modules that aren't built (drafts) are left out entirely.
  const jsPaths = (await walk(join(root, "src"), root)).filter((p) => {
    if (!p.endsWith(".js") || p.startsWith("src/sw/")) return false;
    const locale = LOCALE_MODULE_RE.exec(p)?.[1];
    return !locale || built.has(locale);
  });
  const code = {};
  const deps = {};
  for (const p of jsPaths) {
    const source = await readFile(join(root, p), "utf8");
    // The generated presets module ships as generated (CC0 header included).
    code[p] = p.startsWith("src/generated/") ? source : stripComments(source);
    deps[p] = findImports(code[p]).map((spec) => resolveSpecifier(p, spec));
  }
  for (const p of topoSort(deps)) {
    const rewritten = rewriteImports(code[p], (spec) => relativeSpecifier(p, assets[resolveSpecifier(p, spec)]));
    assets[p] = hashName(p, rewritten);
    out.set(assets[p], rewritten);
  }

  // Pages.
  const template = await readFile(join(root, "index.html"), "utf8");
  const cspInTemplate = template.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)?.[0];
  if (!cspInTemplate) throw new Error("build template: no CSP meta tag in index.html");
  if (!template.includes('<meta name="referrer" content="no-referrer">')) {
    throw new Error('build template: no <meta name="referrer" content="no-referrer"> in index.html');
  }
  const ogImage = siteUrl(origin, base, assets["icons/og-image.png"]);

  const renderPage = ({ locale, page, title, description, above = "", below = "", exam = null, pageWarning = false }) => {
    const S = strings[locale.code];
    const dir = localeDir(locale.code, DEFAULT_LOCALE);
    // Relative path from this page back to the site root.
    const prefix = "../".repeat(`${dir}${page}`.split("/").filter(Boolean).length);
    const canonical = siteUrl(origin, base, `${dir}${page}`);
    // The build owns the CSP: whatever the dev template says is replaced.
    let html = replaceOnce(template, cspInTemplate, cspMeta());
    // Language: <html lang>, and the one strings module this page loads.
    html = replaceOnce(
      html,
      '<html lang="en">',
      `<html lang="${esc(locale.code)}" dir="${esc(locale.dir)}" data-strings="${prefix}${assets[`src/ui/i18n/${locale.code}.js`]}">`,
    );
    html = html.replace(/<noscript>[\s\S]*?<\/noscript>/, () => `<noscript>${esc(S.noscript)}</noscript>`);
    html = replaceOnce(
      html,
      "<!-- build:lang -->",
      langSwitchHtml({ current: locale.code, locales, page, prefix, S, defaultCode: DEFAULT_LOCALE }),
    );
    html = replaceOnce(html, 'href="src/ui/styles.css"', `href="${prefix}${assets["src/ui/styles.css"]}"`);
    html = replaceOnce(html, 'src="src/ui/main.js"', `src="${prefix}${assets["src/ui/main.js"]}"`);
    html = replaceOnce(html, 'href="favicon.svg"', `href="${prefix}${assets["favicon.svg"]}"`);
    html = replaceOnce(html, "<title>ExamSnap</title>", `<title>${esc(title)}</title>`);
    html = replaceOnce(
      html,
      "<!-- build:head -->",
      headTags({
        title,
        description,
        canonical,
        ogImage,
        S,
        lang: locale.code,
        alternates: alternatesFor(page, { locales, origin, base, defaultCode: DEFAULT_LOCALE }),
        extra: [
          `<link rel="manifest" href="${prefix}manifest.webmanifest">`,
          `<meta name="theme-color" content="${THEME_COLOR}">`,
          `<link rel="apple-touch-icon" href="${prefix}${assets["icons/apple-touch-icon.png"]}">`,
        ],
      }),
    );
    html = replaceOnce(html, "<!-- build:above -->", above);
    html = replaceOnce(html, "<!-- build:below -->", below);
    const examAttr = exam ? ` data-exam="${esc(exam)}"` : "";
    html = replaceOnce(html, "<body>", `<body${examAttr} data-sw="${prefix}sw.js">`);
    if (pageWarning) {
      // The warning is already above the tool; show it only once per page.
      html = replaceOnce(html, '<p id="warning" class="warning" data-s="secondaryWarning" hidden></p>', "");
    }
    if (exam) {
      // The exam heading is the page's h1; the brand becomes a link home.
      html = replaceOnce(
        html,
        '<h1 class="brand" data-s="appName"></h1>',
        `<p class="brand"><a href="${prefix}${dir}" data-s="appName"></a></p>`,
      );
    }
    return fillDataStrings(html, S);
  };

  // Every page in every built language: "" (root) and "<id>/" inside the
  // locale's folder. pages lists paths from the site root.
  const pages = [];
  const sitemap = [];
  const lastmod = Object.fromEntries(PRESETS.map((p) => [`${p.id}/`, p.last_verified]));
  lastmod[""] = latestDate(PRESETS.map((p) => p.last_verified));
  for (const locale of locales) {
    const S = strings[locale.code];
    const presets = PRESETS.map((p) => localizePreset(p, locale.code));
    const dir = localeDir(locale.code, DEFAULT_LOCALE);
    const add = (page, options) => {
      pages.push(`${dir}${page}`);
      out.set(`${dir}${page}index.html`, renderPage({ locale, page, ...options }));
      sitemap.push({
        loc: siteUrl(origin, base, `${dir}${page}`),
        lastmod: lastmod[page],
        alternates: alternatesFor(page, { locales, origin, base, defaultCode: DEFAULT_LOCALE }),
      });
    };
    add("", { title: S.docTitle, description: S.rootDescription, below: examLinksHtml(presets, S) });
    for (const p of presets) {
      add(`${p.id}/`, {
        title: pageTitle(p, S),
        description: pageDescription(p, S),
        above: landingAboveHtml(p, S),
        below: landingBelowHtml(p, S),
        exam: p.id,
        pageWarning: hasPageWarning(p),
      });
    }
  }
  // One 404 page (GitHub Pages serves a single 404.html), in the default language.
  out.set("404.html", notFoundHtml({ base, css: assets["src/ui/styles.css"], favicon: assets["favicon.svg"], S: strings[DEFAULT_LOCALE] }));

  // PWA: manifest, then a service worker precaching every page and asset
  // (not the Open Graph image, which only crawlers fetch).
  out.set(
    "manifest.webmanifest",
    manifestJson({
      S: strings[DEFAULT_LOCALE],
      base,
      icons: {
        any192: assets["icons/icon-192.png"],
        any512: assets["icons/icon-512.png"],
        maskable512: assets["icons/icon-512-maskable.png"],
      },
    }),
  );
  const precacheFiles = [...out.keys()]
    .filter((p) => p !== assets["icons/og-image.png"])
    .sort();
  const toUrl = (p) => (p === "index.html" ? "./" : p.endsWith("/index.html") ? p.slice(0, -"index.html".length) : p);
  const precache = precacheFiles.map(toUrl);
  out.set(
    "sw.js",
    swSource({
      cache: cacheName(precacheFiles.map((p) => [toUrl(p), out.get(p)])),
      precache,
      body: stripComments(await readFile(join(root, "src/sw/sw.js"), "utf8")),
    }),
  );

  // Crawling.
  out.set("sitemap.xml", sitemapXml(sitemap));
  out.set("robots.txt", robotsTxt(siteUrl(origin, base, "sitemap.xml")));

  // No http:// URLs anywhere (compensates for omitting upgrade-insecure-requests).
  // Static assets (CSS, images) are buffers; findInsecureUrls picks the text types.
  const insecure = findInsecureUrls(
    [...out].map(([path, d]) => ({ path, text: typeof d === "string" ? d : Buffer.from(d).toString("utf8") })),
  );
  if (insecure.length) throw new Error(`http:// URLs in the build:\n${insecure.join("\n")}`);

  // Write.
  await rm(outDir, { recursive: true, force: true });
  const files = [];
  for (const path of [...out.keys()].sort()) {
    const data = out.get(path);
    const buf = typeof data === "string" ? Buffer.from(data) : data;
    await mkdir(dirname(join(outDir, path)), { recursive: true });
    await writeFile(join(outDir, path), buf);
    files.push({ path, size: buf.length });
  }
  // Budget per page: a page ships the shared modules plus its own language.
  const jsByLocale = jsBytesByLocale(files, locales.map((l) => l.code));
  for (const [code, bytes] of Object.entries(jsByLocale)) {
    if (bytes >= JS_BUDGET) throw new Error(`shipped JS on ${code} pages is ${bytes} bytes (budget ${JS_BUDGET}, excluding src/generated/)`);
  }
  const js = Math.max(...Object.values(jsByLocale));
  return { files, totalBytes: files.reduce((n, f) => n + f.size, 0), jsBytes: js, jsByLocale, locales: locales.map((l) => l.code), pages, assets };
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  const base = process.env.BASE_PATH || DEFAULT_BASE;
  const origin = process.env.SITE_ORIGIN || DEFAULT_ORIGIN;
  const includeDrafts = process.env.INCLUDE_DRAFTS === "1";
  const { files, totalBytes, jsByLocale, pages } = await build({ base, origin, includeDrafts });
  for (const f of files) console.log(`${String(f.size).padStart(8)}  dist/${f.path}`);
  console.log(`\n${files.length} files, ${totalBytes} bytes.`);
  console.log(`Shipped JS per page (excl. presets): ${Object.entries(jsByLocale).map(([c, n]) => `${c} ${n} bytes`).join(", ")}.`);
  console.log(`Pages (${pages.length}): ${pages.map((p) => `${normalizeBase(base)}${p}`).join(", ")}`);
}
