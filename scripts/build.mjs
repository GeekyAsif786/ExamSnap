// SPDX-License-Identifier: AGPL-3.0-or-later
// Build the deployable site into dist/: content-hashed assets, one landing
// page per preset, sitemap, robots, 404. No bundler, no minifier.
//   BASE_PATH   URL prefix the site is served under (default /ExamSnap/)
//   SITE_ORIGIN origin for absolute URLs (default https://geekyasif786.github.io)
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
  jsBytes,
  landingAboveHtml,
  landingBelowHtml,
  cacheName,
  latestDate,
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
 * @param {{ root?: string, outDir?: string, base?: string, origin?: string }} [options]
 * @returns {Promise<{ files: { path: string, size: number }[], totalBytes: number, jsBytes: number, pages: string[], assets: Record<string, string> }>}
 */
export async function build({ root = ROOT, outDir, base = DEFAULT_BASE, origin = DEFAULT_ORIGIN } = {}) {
  base = normalizeBase(base);
  outDir ??= join(root, "dist");
  const { PRESETS } = await import(pathToFileURL(join(root, "src/generated/presets.js")).href);
  const { STRINGS: S } = await import(pathToFileURL(join(root, "src/ui/strings.js")).href);

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
  const jsPaths = (await walk(join(root, "src"), root)).filter((p) => p.endsWith(".js") && !p.startsWith("src/sw/"));
  const code = {};
  const deps = {};
  for (const p of jsPaths) {
    code[p] = await readFile(join(root, p), "utf8");
    deps[p] = findImports(code[p]).map((spec) => resolveSpecifier(p, spec));
  }
  for (const p of topoSort(deps)) {
    const rewritten = rewriteImports(code[p], (spec) => relativeSpecifier(p, assets[resolveSpecifier(p, spec)]));
    assets[p] = hashName(p, rewritten);
    out.set(assets[p], rewritten);
  }

  // Pages.
  const template = await readFile(join(root, "index.html"), "utf8");
  const csp = template.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)?.[0];
  if (!csp) throw new Error("build template: no CSP meta tag in index.html");
  const ogImage = siteUrl(origin, base, assets["icons/og-image.png"]);

  const renderPage = ({ prefix, title, description, canonical, above = "", below = "", exam = null, pageWarning = false }) => {
    let html = template;
    html = replaceOnce(html, 'href="src/ui/styles.css"', `href="${prefix}${assets["src/ui/styles.css"]}"`);
    html = replaceOnce(html, 'src="src/ui/app.js"', `src="${prefix}${assets["src/ui/app.js"]}"`);
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
        `<p class="brand"><a href="${prefix}" data-s="appName"></a></p>`,
      );
    }
    return fillDataStrings(html, S);
  };

  const pages = [""];
  out.set(
    "index.html",
    renderPage({
      prefix: "",
      title: S.docTitle,
      description: S.rootDescription,
      canonical: siteUrl(origin, base),
      below: examLinksHtml(PRESETS, S),
    }),
  );
  for (const p of PRESETS) {
    pages.push(`${p.id}/`);
    out.set(
      `${p.id}/index.html`,
      renderPage({
        prefix: "../",
        title: pageTitle(p, S),
        description: pageDescription(p, S),
        canonical: siteUrl(origin, base, `${p.id}/`),
        above: landingAboveHtml(p, S),
        below: landingBelowHtml(p, S),
        exam: p.id,
        pageWarning: hasPageWarning(p),
      }),
    );
  }
  out.set("404.html", notFoundHtml({ base, csp, css: assets["src/ui/styles.css"], favicon: assets["favicon.svg"], S }));

  // PWA: manifest, then a service worker precaching every page and asset
  // (not the Open Graph image, which only crawlers fetch).
  out.set(
    "manifest.webmanifest",
    manifestJson({
      S,
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
      body: await readFile(join(root, "src/sw/sw.js"), "utf8"),
    }),
  );

  // Crawling.
  const lastmod = Object.fromEntries(PRESETS.map((p) => [`${p.id}/`, p.last_verified]));
  lastmod[""] = latestDate(PRESETS.map((p) => p.last_verified));
  out.set("sitemap.xml", sitemapXml(pages.map((pg) => ({ loc: siteUrl(origin, base, pg), lastmod: lastmod[pg] }))));
  out.set("robots.txt", robotsTxt(siteUrl(origin, base, "sitemap.xml")));

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
  const js = jsBytes(files);
  if (js >= JS_BUDGET) throw new Error(`shipped JS is ${js} bytes (budget ${JS_BUDGET}, excluding src/generated/)`);
  return { files, totalBytes: files.reduce((n, f) => n + f.size, 0), jsBytes: js, pages, assets };
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  const base = process.env.BASE_PATH || DEFAULT_BASE;
  const origin = process.env.SITE_ORIGIN || DEFAULT_ORIGIN;
  const { files, totalBytes, jsBytes: js, pages } = await build({ base, origin });
  for (const f of files) console.log(`${String(f.size).padStart(8)}  dist/${f.path}`);
  console.log(`\n${files.length} files, ${totalBytes} bytes. Shipped JS (excl. presets): ${js} bytes.`);
  console.log(`Pages: ${pages.map((p) => `${normalizeBase(base)}${p}`).join(", ")}`);
}
