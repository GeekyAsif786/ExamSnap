// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "../src/generated/presets.js";
import { STRINGS as S } from "../src/ui/strings.js";
import {
  cacheName,
  docNoun,
  esc,
  examLinksHtml,
  fillDataStrings,
  findImports,
  hashName,
  headTags,
  jsBytes,
  joinList,
  jsonLd,
  landingAboveHtml,
  latestDate,
  manifestJson,
  normalizeOrigin,
  pageDescription,
  pageTitle,
  relativeSpecifier,
  replaceOnce,
  resolveSpecifier,
  rewriteImports,
  robotsTxt,
  shortName,
  siteUrl,
  sitemapXml,
  swSource,
  topoSort,
  truncateWords,
} from "../scripts/build-lib.mjs";

const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

test("siteUrl: origin + base + path; custom domain only needs base '/' and a new origin", () => {
  assert.equal(siteUrl("https://geekyasif786.github.io", "/ExamSnap/", "ssc/"), "https://geekyasif786.github.io/ExamSnap/ssc/");
  assert.equal(siteUrl("https://geekyasif786.github.io/", "ExamSnap"), "https://geekyasif786.github.io/ExamSnap/");
  assert.equal(siteUrl("https://examsnap.in", "/", "sitemap.xml"), "https://examsnap.in/sitemap.xml");
  assert.equal(normalizeOrigin("https://examsnap.in/some/path"), "https://examsnap.in");
});

test("hashName: 8 hex chars before the extension, stable and content-dependent", () => {
  const a = hashName("src/ui/app.js", "export {}");
  assert.match(a, /^src\/ui\/app\.[0-9a-f]{8}\.js$/);
  assert.equal(hashName("src/ui/app.js", "export {}"), a);
  assert.notEqual(hashName("src/ui/app.js", "export {};"), a);
  assert.match(hashName("icons/og-image.png", new Uint8Array([1, 2, 3])), /^icons\/og-image\.[0-9a-f]{8}\.png$/);
  assert.match(hashName("dir.v2/LICENSE", "x"), /^dir\.v2\/LICENSE\.[0-9a-f]{8}$/);
});

test("findImports / rewriteImports handle static import and export-from forms", () => {
  const code = `import { a } from "./a.js";\nimport b from '../core/b.js';\nexport { c } from "./c.js";\nimport "./side.js";\nconst x = "./not-an-import.js";\nimport { y } from "node:fs";\n`;
  assert.deepEqual(findImports(code), ["./a.js", "../core/b.js", "./c.js", "./side.js"]);
  const out = rewriteImports(code, (s) => s.replace(".js", ".h.js"));
  assert.equal(
    out,
    `import { a } from "./a.h.js";\nimport b from '../core/b.h.js';\nexport { c } from "./c.h.js";\nimport "./side.h.js";\nconst x = "./not-an-import.js";\nimport { y } from "node:fs";\n`,
  );
});

test("resolveSpecifier / relativeSpecifier", () => {
  assert.equal(resolveSpecifier("src/ui/app.js", "../core/index.js"), "src/core/index.js");
  assert.equal(resolveSpecifier("src/ui/app.js", "./state.js"), "src/ui/state.js");
  assert.equal(relativeSpecifier("src/ui/app.js", "src/core/index.1234abcd.js"), "../core/index.1234abcd.js");
  assert.equal(relativeSpecifier("src/ui/app.js", "src/ui/state.1234abcd.js"), "./state.1234abcd.js");
  assert.equal(relativeSpecifier("src/core/index.js", "src/core/jpeg.1234abcd.js"), "./jpeg.1234abcd.js");
});

test("topoSort puts imports first and rejects cycles and unknown modules", () => {
  const order = topoSort({ "a.js": ["b.js", "c.js"], "b.js": ["c.js"], "c.js": [] });
  assert.deepEqual(order, ["c.js", "b.js", "a.js"]);
  assert.throws(() => topoSort({ "a.js": ["b.js"], "b.js": ["a.js"] }), /import cycle: a\.js -> b\.js -> a\.js/);
  assert.throws(() => topoSort({ "a.js": ["x.js"] }), /unknown module x\.js/);
});

test("shortName and truncateWords", () => {
  assert.equal(shortName("SSC — CGL / CHSL / MTS / GD / CPO"), "SSC");
  assert.equal(shortName("JEE Main (NTA)"), "JEE Main");
  assert.equal(shortName("UPSC — Civil Services (and other UPSC exams)"), "UPSC");
  assert.equal(shortName("Plain"), "Plain");
  assert.equal(truncateWords("short", 10), "short");
  assert.equal(truncateWords("one two three four", 12), "one two…");
  assert.equal(truncateWords("one two, three", 10), "one two…");
  assert.ok(truncateWords("a".repeat(80), 65).length <= 65);
});

test("pageTitle: real presets fit in 65 chars using the full template", () => {
  assert.equal(pageTitle(byId.ssc, S), "SSC photo & signature resizer: exact size & KB | ExamSnap");
  assert.equal(pageTitle(byId["jee-main"], S), "JEE Main photo & signature resizer: exact size & KB | ExamSnap");
  for (const p of PRESETS) assert.ok(pageTitle(p, S).length <= 65, p.id);
});

test("pageTitle: falls back to the full name with the short template, then truncates", () => {
  const p = { name: "Medium Exam Name (Board)" };
  // Full template with "Medium Exam Name" is 70 chars; short template with the full name fits.
  assert.equal(pageTitle(p, S), "Medium Exam Name (Board) photo & signature resizer | ExamSnap");
  const long = { name: "A Very Long Examination Name That Goes On And On (Board)" };
  const t = pageTitle(long, S);
  assert.ok(t.length <= 65, t);
  assert.match(t, /…$/);
  assert.ok(!/\s…$/.test(t), "no space before the ellipsis");
});

test("pageDescription is built from the real specs", () => {
  assert.equal(
    pageDescription(byId.ssc, S),
    "Resize your SSC photo to 276×354 px, 20–50 KB and signature to 472×157 px, 10–20 KB. Free, works offline, nothing is uploaded.",
  );
  assert.equal(
    pageDescription(byId["upsc-cse"], S),
    "Resize your UPSC photo to 400×500 px, 20–200 KB, signature to 500×350 px, 20–100 KB and photo ID card to 800×500 px, 20–200 KB. Free, works offline, nothing is uploaded.",
  );
});

test("docNoun and joinList", () => {
  assert.equal(docNoun({ kind: "thumb", label: "Left thumb impression" }, S), "thumb impression");
  assert.equal(docNoun({ kind: "document", label: "Handwritten declaration" }, S), "handwritten declaration");
  assert.equal(joinList(["a"], S), "a");
  assert.equal(joinList(["a", "b"], S), "a and b");
  assert.equal(joinList(["a", "b", "c"], S), "a, b and c");
});

test("landingAboveHtml: escaped h1, warning only without a notice, one row per document", () => {
  const html = landingAboveHtml(byId.ssc, S);
  assert.match(html, /<h1 id="page-title">SSC — CGL \/ CHSL \/ MTS \/ GD \/ CPO photo &amp; signature resizer<\/h1>/);
  assert.match(html, /class="warning"/);
  assert.equal(html.match(/<tr>/g).length, 1 + byId.ssc.documents.length);
  assert.doesNotMatch(landingAboveHtml(byId["banking-ibps"], S), /class="warning"/);
  assert.match(landingAboveHtml(byId["banking-ibps"], S), /<td>—<\/td>/, "missing notes render as an em dash");
});

test("examLinksHtml links relatively to every preset", () => {
  const html = examLinksHtml(PRESETS, S);
  for (const p of PRESETS) assert.ok(html.includes(`<a href="${p.id}/">${esc(p.name)}</a>`), p.id);
});

test("jsonLd: WebApplication, free, INR, and safe inside <script>", () => {
  const data = JSON.parse(jsonLd({ name: "ExamSnap", url: "https://x/", description: "a </script> b" }));
  assert.equal(data["@type"], "WebApplication");
  assert.deepEqual(data.offers, { "@type": "Offer", price: "0", priceCurrency: "INR" });
  assert.equal(data.isAccessibleForFree, true);
  assert.doesNotMatch(jsonLd({ name: "x", url: "y", description: "</script>" }), /<\/script>/);
});

test("headTags: canonical, OG, Twitter, JSON-LD, attributes escaped", () => {
  const html = headTags({ title: 'A & "B"', description: "d", canonical: "https://x/ExamSnap/", ogImage: "https://x/og.png", S });
  assert.match(html, /<link rel="canonical" href="https:\/\/x\/ExamSnap\/">/);
  assert.match(html, /<meta property="og:title" content="A &amp; &quot;B&quot;">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("fillDataStrings fills empty data-s elements and rejects non-string keys", () => {
  assert.equal(fillDataStrings('<p class="t" data-s="tagline"></p>', S), `<p class="t" data-s="tagline">${S.tagline}</p>`);
  assert.equal(fillDataStrings('<h1 data-s="docTitle"></h1>', S), "<h1 data-s=\"docTitle\">ExamSnap — exam photo &amp; signature resizer</h1>");
  assert.throws(() => fillDataStrings('<p data-s="pageTitle"></p>', S), /not a plain string/);
});

test("replaceOnce requires exactly one match", () => {
  assert.equal(replaceOnce("a-b-c", "b", "X"), "a-X-c");
  assert.throws(() => replaceOnce("a-b-b", "b", "X"), /exactly one/);
  assert.throws(() => replaceOnce("a", "b", "X"), /exactly one/);
});

test("sitemapXml, robotsTxt, latestDate", () => {
  const xml = sitemapXml([
    { loc: "https://x/ExamSnap/", lastmod: "2026-11-11" },
    { loc: "https://x/ExamSnap/ssc/", lastmod: "2026-10-01" },
  ]);
  assert.equal(
    xml,
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "  <url>\n    <loc>https://x/ExamSnap/</loc>\n    <lastmod>2026-11-11</lastmod>\n  </url>\n" +
      "  <url>\n    <loc>https://x/ExamSnap/ssc/</loc>\n    <lastmod>2026-10-01</lastmod>\n  </url>\n</urlset>\n",
  );
  assert.equal(robotsTxt("https://x/ExamSnap/sitemap.xml"), "User-agent: *\nAllow: /\n\nSitemap: https://x/ExamSnap/sitemap.xml\n");
  assert.equal(latestDate(["2026-01-02", "2026-11-11", "2025-12-31"]), "2026-11-11");
});

test("jsBytes counts .js except src/generated", () => {
  const files = [
    { path: "src/ui/app.1.js", size: 100 },
    { path: "sw.js", size: 10 },
    { path: "src/generated/presets.1.js", size: 5000 },
    { path: "src/ui/styles.1.css", size: 999 },
  ];
  assert.equal(jsBytes(files), 110);
});

test("manifestJson: start_url, scope and id follow BASE_PATH; icons and colours", () => {
  const icons = { any192: "icons/a.png", any512: "icons/b.png", maskable512: "icons/c.png" };
  const m = JSON.parse(manifestJson({ S, base: "/ExamSnap/", icons }));
  assert.equal(m.start_url, "/ExamSnap/");
  assert.equal(m.scope, "/ExamSnap/");
  assert.equal(m.display, "standalone");
  assert.equal(m.theme_color, "#1d4ed8");
  assert.equal(m.background_color, "#f6f6f3");
  assert.deepEqual(
    m.icons.map((i) => [i.src, i.sizes, i.purpose]),
    [
      ["icons/a.png", "192x192", "any"],
      ["icons/b.png", "512x512", "any"],
      ["icons/c.png", "512x512", "maskable"],
    ],
  );
  assert.equal(JSON.parse(manifestJson({ S, base: "/", icons })).start_url, "/");
});

test("cacheName changes with any precached URL or byte, and is stable otherwise", () => {
  const a = cacheName([["./", "<html>"], ["app.1.js", "x"]]);
  assert.match(a, /^examsnap-[0-9a-f]{12}$/);
  assert.equal(cacheName([["./", "<html>"], ["app.1.js", "x"]]), a);
  assert.notEqual(cacheName([["./", "<html>"], ["app.1.js", "y"]]), a);
  assert.notEqual(cacheName([["./", "<html>"], ["app.2.js", "x"]]), a);
  // Boundaries matter: moving a byte between entries changes the hash.
  assert.notEqual(cacheName([["a", "bc"]]), cacheName([["ab", "c"]]));
});

test("swSource prepends CACHE and PRECACHE to the worker body", () => {
  const src = swSource({ cache: "examsnap-abc", precache: ["./", "a.js"], body: "// SPDX-License-Identifier: X\nself.x = 1;\n" });
  assert.match(src, /^\/\/ GENERATED by scripts\/build\.mjs/);
  assert.match(src, /const CACHE = "examsnap-abc";/);
  assert.ok(src.includes(`const PRECACHE = [\n  "./",\n  "a.js"\n];`));
  assert.equal(src.match(/SPDX-License-Identifier/g).length, 1);
  assert.ok(src.endsWith("self.x = 1;\n"));
});
