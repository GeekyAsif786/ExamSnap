// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, JS_BUDGET } from "../scripts/build.mjs";
import { CSP } from "../scripts/build-lib.mjs";
import { cp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PRESETS } from "../src/generated/presets.js";

const tmp = () => mkdtemp(join(tmpdir(), "examsnap-build-"));

test("two builds are byte-identical", async (t) => {
  const [a, b] = await Promise.all([tmp(), tmp()]);
  t.after(() => Promise.all([rm(a, { recursive: true, force: true }), rm(b, { recursive: true, force: true })]));
  const ra = await build({ outDir: a });
  const rb = await build({ outDir: b });
  assert.deepEqual(ra.files, rb.files);
  for (const f of ra.files) {
    assert.ok((await readFile(join(a, f.path))).equals(await readFile(join(b, f.path))), f.path);
  }
});

test("output layout: pages, crawl files, hashed assets, budget", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const paths = r.files.map((f) => f.path);
  for (const p of [
    "index.html", "404.html", "sitemap.xml", "robots.txt", "manifest.webmanifest", "sw.js", "hi/index.html",
    ...PRESETS.flatMap((p) => [`${p.id}/index.html`, `hi/${p.id}/index.html`]),
  ]) {
    assert.ok(paths.includes(p), p);
  }
  // Every JS/CSS/image asset is content-hashed; no unhashed source paths ship.
  for (const p of paths.filter((p) => /\.(js|css|png|svg)$/.test(p) && p !== "sw.js")) {
    assert.match(p, /\.[0-9a-f]{8}\.(js|css|png|svg)$/, p);
  }
  assert.ok(r.jsBytes < JS_BUDGET);
  assert.deepEqual(Object.keys(r.jsByLocale), ["en", "hi"]);
  for (const bytes of Object.values(r.jsByLocale)) assert.ok(bytes < JS_BUDGET);
  assert.deepEqual(r.pages, ["", ...PRESETS.map((p) => `${p.id}/`), "hi/", ...PRESETS.map((p) => `hi/${p.id}/`)]);
});

test("defaults: the custom domain at the root", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build({ outDir: dir });
  const ssc = await readFile(join(dir, "ssc/index.html"), "utf8");
  assert.match(ssc, /<link rel="canonical" href="https:\/\/examsnap\.xac3\.xyz\/ssc\/">/);
  assert.equal(await readFile(join(dir, "robots.txt"), "utf8"), "User-agent: *\nAllow: /\n\nSitemap: https://examsnap.xac3.xyz/sitemap.xml\n");
  const manifest = JSON.parse(await readFile(join(dir, "manifest.webmanifest"), "utf8"));
  assert.deepEqual([manifest.id, manifest.start_url, manifest.scope], ["/", "/", "/"]);
  assert.match(await readFile(join(dir, "sitemap.xml"), "utf8"), /<loc>https:\/\/examsnap\.xac3\.xyz\/<\/loc>/);
  assert.match(await readFile(join(dir, "404.html"), "utf8"), /href="\/src\/ui\/styles\.[0-9a-f]{8}\.css"/);
});

test("BASE_PATH still works: a GitHub Pages project site under /ExamSnap/", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build({ outDir: dir, base: "/ExamSnap/", origin: "https://geekyasif786.github.io" });
  const ssc = await readFile(join(dir, "ssc/index.html"), "utf8");
  assert.match(ssc, /<link rel="canonical" href="https:\/\/geekyasif786\.github\.io\/ExamSnap\/ssc\/">/);
  assert.match(ssc, /src="\.\.\/src\/ui\/main\.[0-9a-f]{8}\.js"/, "assets stay relative");
  assert.match(await readFile(join(dir, "404.html"), "utf8"), /href="\/ExamSnap\/src\/ui\/styles\.[0-9a-f]{8}\.css"/);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.webmanifest"), "utf8"));
  assert.deepEqual([manifest.id, manifest.start_url, manifest.scope], ["/ExamSnap/", "/ExamSnap/", "/ExamSnap/"]);
});

test("BASE_PATH and SITE_ORIGIN: another custom domain only needs base '/' and a new origin", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build({ outDir: dir, base: "/", origin: "https://examsnap.example" });
  const ssc = await readFile(join(dir, "ssc/index.html"), "utf8");
  assert.match(ssc, /<link rel="canonical" href="https:\/\/examsnap\.example\/ssc\/">/);
  assert.match(ssc, /src="\.\.\/src\/ui\/main\.[0-9a-f]{8}\.js"/, "assets stay relative");
  const notFound = await readFile(join(dir, "404.html"), "utf8");
  assert.match(notFound, /href="\/src\/ui\/styles\.[0-9a-f]{8}\.css"/, "404 uses root-absolute paths under the base");
  assert.match(await readFile(join(dir, "robots.txt"), "utf8"), /Sitemap: https:\/\/examsnap\.example\/sitemap\.xml/);
  // No root-absolute /ExamSnap/ paths or default-origin URLs left over (the
  // GitHub repo link in the footer legitimately contains "ExamSnap/").
  assert.doesNotMatch(ssc + notFound, /["'(]\/ExamSnap\//, "no leftover /ExamSnap/ paths");
  assert.doesNotMatch(ssc + notFound, /github\.io/, "no default-origin URLs");
});

test("hashed imports point at files that exist in the build", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const paths = new Set(r.files.map((f) => f.path));
  for (const f of r.files.filter((f) => f.path.endsWith(".js") && f.path.startsWith("src/"))) {
    const code = await readFile(join(dir, f.path), "utf8");
    for (const m of code.matchAll(/\b(?:from\s*|import\s*\(\s*)"(\.{1,2}\/[^"]+)"/g)) {
      const target = new URL(m[1], `file:///${f.path}`).pathname.slice(1);
      assert.ok(paths.has(target), `${f.path} imports missing ${target}`);
    }
  }
});

test("sw.js precaches every page and shipped asset (not the OG image), and parses", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const sw = await readFile(join(dir, "sw.js"), "utf8");
  const precache = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  assert.ok(precache.includes("./"));
  for (const p of PRESETS) assert.ok(precache.includes(`${p.id}/`), p.id);
  for (const f of r.files) {
    if (/^(sw\.js|sitemap\.xml|robots\.txt)$/.test(f.path) || f.path.includes("og-image")) continue;
    const url = f.path === "index.html" ? "./" : f.path.replace(/index\.html$/, "");
    assert.ok(precache.includes(url), `${f.path} not precached`);
  }
  assert.ok(!precache.some((u) => u.includes("og-image")));
  new Function(sw); // syntax check
  // A content change gives a new cache name.
  const other = await tmp();
  t.after(() => rm(other, { recursive: true, force: true }));
  await build({ outDir: other, origin: "https://examsnap.example" });
  const cacheOf = async (d) => (await readFile(join(d, "sw.js"), "utf8")).match(/const CACHE = "([^"]+)"/)[1];
  assert.notEqual(await cacheOf(dir), await cacheOf(other));
});

test("the in-tool warning is left out exactly where the page-level warning is shown", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build({ outDir: dir });
  for (const p of PRESETS) {
    const html = await readFile(join(dir, `${p.id}/index.html`), "utf8");
    const pageLevel = !p.sources.some((s) => s.type === "notice");
    assert.equal(html.includes('id="page-warning"'), pageLevel, p.id);
    assert.equal(html.includes('id="warning"'), !pageLevel, p.id);
    assert.equal(html.match(/class="warning"/g).length, 1, p.id);
  }
  assert.ok((await readFile(join(dir, "index.html"), "utf8")).includes('id="warning"'), "root keeps the in-tool warning");
});

const cspOf = (html) => [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)].map((m) => m[1]);

test("production, preview and e2e (sub-path) builds emit the identical CSP on every page", async (t) => {
  const configs = [
    {}, // production defaults (also what npm run preview builds)
    { base: "/ExamSnap/" }, // e2e chromium-subpath
    { base: "/", origin: "https://examsnap.example" },
  ];
  for (const config of configs) {
    const dir = await tmp();
    t.after(() => rm(dir, { recursive: true, force: true }));
    const r = await build({ outDir: dir, ...config });
    for (const f of r.files.filter((f) => f.path.endsWith(".html"))) {
      const html = await readFile(join(dir, f.path), "utf8");
      assert.deepEqual(cspOf(html), [CSP], `${JSON.stringify(config)} ${f.path}`);
      assert.ok(html.includes('<meta name="referrer" content="no-referrer">'), f.path);
    }
  }
  // The dev template carries the same policy, so npm run dev behaves alike.
  const template = await readFile(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
  assert.deepEqual(cspOf(template), [CSP]);
});

test("the build fails on any http:// URL in its output", async (t) => {
  const src = await tmp();
  const out = await tmp();
  t.after(() => Promise.all([rm(src, { recursive: true, force: true }), rm(out, { recursive: true, force: true })]));
  const root = fileURLToPath(new URL("..", import.meta.url));
  for (const p of ["index.html", "favicon.svg", "icons", "src"]) await cp(join(root, p), join(src, p), { recursive: true });
  const css = join(src, "src/ui/styles.css");
  await writeFile(css, `${await readFile(css, "utf8")}\n.x { background: url(http://cdn.example/x.png); }\n`);
  await assert.rejects(build({ root: src, outDir: out }), /http:\/\/ URLs in the build:\nsrc\/ui\/styles\.[0-9a-f]{8}\.css: http:\/\/cdn\.example\/x\.png/);
});

test("XSS fixture: every preset value is escaped in pages, attributes and JSON-LD", async (t) => {
  const { buildXssSite, PAYLOADS } = await import("./support/xss-site.mjs");
  const { outDir, cleanup } = await buildXssSite();
  t.after(cleanup);
  for (const page of ["xss-test/index.html", "index.html"]) {
    const html = await readFile(join(outDir, page), "utf8");
    // Only the two scripts we put there; no injected tags or handlers.
    assert.deepEqual(
      [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]),
      [/<script type="module" src="[^"]+">/i.exec(html)[0], '<script type="application/ld+json">'],
      page,
    );
    // The only <img> tag is the app's result image; no tag has an event handler.
    assert.deepEqual([...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]), ['<img id="result-img" class="result-img" alt="">'], page);
    // Attribute *names* only: quoted values may legitimately contain the escaped payload text.
    const attrNames = [...html.matchAll(/<[a-z][^>]*>/gi)].flatMap((m) =>
      [...m[0].replace(/"[^"]*"/g, '""').matchAll(/\s([a-z-:]+)=/gi)].map((a) => a[1].toLowerCase()),
    );
    assert.deepEqual(attrNames.filter((n) => n.startsWith("on")), [], page);
    // JSON-LD can't be closed early and still round-trips the raw text.
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script\s*>/i)[1];
    assert.doesNotMatch(ld, /</, page);
    const data = JSON.parse(ld);
    if (page !== "index.html") for (const p of PAYLOADS) assert.ok(data.description.includes(p), `${page} JSON-LD keeps ${p}`);
  }
  const landing = await readFile(join(outDir, "xss-test/index.html"), "utf8");
  assert.ok(landing.includes("&lt;script&gt;alert(1)&lt;/script&gt; &quot;&gt;&lt;img src=x onerror=alert(1)&gt; &lt;/script&gt;"));
  assert.ok(landing.includes('href="https://example.org/notice?a=1&amp;b=2"'), "attribute values are escaped");
  assert.match(landing, /<title>XSS test &lt;script&gt;/);
});

test("request-exam link: in step 1 and the footer of every page, including 404", async (t) => {
  const { REQUEST_EXAM_URL } = await import("../scripts/build-lib.mjs");
  const { requestExamUrl } = await import("../src/ui/state.js");
  assert.equal(REQUEST_EXAM_URL, requestExamUrl(null, () => ""));
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const href = `href="${REQUEST_EXAM_URL.replace(/&/g, "&amp;")}" target="_blank" rel="noopener noreferrer"`;
  for (const page of [...r.pages.map((p) => `${p}index.html`), "404.html"]) {
    const html = await readFile(join(dir, page), "utf8");
    const count = html.split(href).length - 1;
    assert.equal(count, page === "404.html" ? 1 : 2, page);
    const footer = html.slice(html.indexOf("<footer"));
    assert.ok(footer.includes(href), `${page}: footer link`);
  }
  const root = await readFile(join(dir, "index.html"), "utf8");
  assert.match(root, /issues\/new\?template=wrong-spec\.yml"/);
});

// ---- Languages ---------------------------------------------------------------

test("every page: <html lang/dir>, its one strings module, self-canonical and hreflang en/hi/x-default", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const origin = "https://examsnap.xac3.xyz/";
  for (const page of r.pages) {
    const html = await readFile(join(dir, page, "index.html"), "utf8");
    const lang = page.startsWith("hi/") ? "hi" : "en";
    const inner = page.replace(/^hi\//, "");
    const depth = page.split("/").filter(Boolean).length;
    const strings = `${"../".repeat(depth)}${r.assets[`src/ui/i18n/${lang}.js`]}`;
    assert.ok(html.includes(`<html lang="${lang}" dir="ltr" data-strings="${strings}">`), page);
    assert.ok(html.includes(`<link rel="canonical" href="${origin}${page}">`), page);
    assert.deepEqual(
      [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]),
      [["en", `${origin}${inner}`], ["hi", `${origin}hi/${inner}`], ["x-default", `${origin}${inner}`]],
      page,
    );
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(ld.inLanguage, lang, page);
    // The other language's module is never referenced.
    assert.ok(!html.includes(r.assets[`src/ui/i18n/${lang === "en" ? "hi" : "en"}.js`]), page);
  }
});

test("language switcher: a plain link to the same page in the other language", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build({ outDir: dir });
  const nav = async (page) => (await readFile(join(dir, page, "index.html"), "utf8")).match(/<nav class="lang"[^>]*>.*?<\/nav>/)[0];
  assert.equal(await nav(""), '<nav class="lang" aria-label="Language"><a href="hi/" hreflang="hi" lang="hi" data-lang-switch>हिंदी</a></nav>');
  assert.equal(await nav("ssc/"), '<nav class="lang" aria-label="Language"><a href="../hi/ssc/" hreflang="hi" lang="hi" data-lang-switch>हिंदी</a></nav>');
  assert.equal(await nav("hi/"), '<nav class="lang" aria-label="भाषा"><a href="../" hreflang="en" lang="en" data-lang-switch>English</a></nav>');
  assert.equal(await nav("hi/ssc/"), '<nav class="lang" aria-label="भाषा"><a href="../../ssc/" hreflang="en" lang="en" data-lang-switch>English</a></nav>');
});

test("Hindi pages: Hindi text in the HTML, title, meta, noscript; brand link stays in /hi/", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build({ outDir: dir });
  const { STRINGS: HI } = await import("../src/ui/i18n/hi.js");
  const { pageTitle } = await import("../scripts/build-lib.mjs");
  const { localizePreset } = await import("../src/ui/i18n/localize.js");
  const root = await readFile(join(dir, "hi/index.html"), "utf8");
  assert.ok(root.includes(`<title>${HI.docTitle}</title>`));
  assert.ok(root.includes(`>${HI.makeButton}<`));
  assert.ok(root.includes(`<noscript>${HI.noscript}</noscript>`));
  const ssc = await readFile(join(dir, "hi/ssc/index.html"), "utf8");
  const title = pageTitle(localizePreset(PRESETS.find((p) => p.id === "ssc"), "hi"), HI);
  assert.ok(ssc.includes(`<title>${title.replace(/&/g, "&amp;")}</title>`), title);
  assert.ok(ssc.includes('<p class="brand"><a href="../../hi/" data-s="appName">ExamSnap</a></p>'));
  const en = await readFile(join(dir, "ssc/index.html"), "utf8");
  assert.ok(en.includes('<p class="brand"><a href="../" data-s="appName">ExamSnap</a></p>'));
  assert.match(en, /<noscript>ExamSnap needs JavaScript to process your photo on your device\. Please enable JavaScript for this page\.<\/noscript>/);
});

test("sitemap: every page in every language with xhtml:link alternates", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const xml = await readFile(join(dir, "sitemap.xml"), "utf8");
  const origin = "https://examsnap.xac3.xyz/";
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), r.pages.map((p) => `${origin}${p}`));
  assert.equal(xml.match(/<xhtml:link /g).length, r.pages.length * 3);
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
});

test("NEET (UG) and CUET (UG) get landing pages in English and Hindi, all in the sitemap", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const xml = await readFile(join(dir, "sitemap.xml"), "utf8");
  for (const page of ["neet-ug/", "cuet-ug/", "hi/neet-ug/", "hi/cuet-ug/"]) {
    assert.ok(r.pages.includes(page), page);
    assert.ok(xml.includes(`<loc>https://examsnap.xac3.xyz/${page}</loc>`), page);
  }
  const hi = await readFile(join(dir, "hi/neet-ug/index.html"), "utf8");
  assert.ok(hi.includes("उँगलियों और अंगूठे के निशान"), "Hindi labels on the Hindi page");
});

test("draft locales are not built (unless INCLUDE_DRAFTS), and fall back to English", async (t) => {
  const src = await tmp();
  const out = await tmp();
  t.after(() => Promise.all([rm(src, { recursive: true, force: true }), rm(out, { recursive: true, force: true })]));
  const root = fileURLToPath(new URL("..", import.meta.url));
  for (const p of ["index.html", "favicon.svg", "icons", "src"]) await cp(join(root, p), join(src, p), { recursive: true });
  const locales = join(src, "src/ui/i18n/locales.js");
  await writeFile(
    locales,
    (await readFile(locales, "utf8")).replace(
      '{ code: "hi", name: "हिंदी", dir: "ltr", status: "published" },',
      '{ code: "hi", name: "हिंदी", dir: "ltr", status: "published" },\n  { code: "ta", name: "தமிழ்", dir: "ltr", status: "draft" },',
    ),
  );
  await writeFile(join(src, "src/ui/i18n/ta.js"), 'export const STRINGS = { makeButton: "கோப்பை உருவாக்கு" };\n');

  const r = await build({ root: src, outDir: out });
  assert.deepEqual(r.locales, ["en", "hi"]);
  assert.ok(!r.files.some((f) => f.path.startsWith("ta/") || f.path.includes("i18n/ta.")), "no draft pages or module");
  assert.ok(!(await readFile(join(out, "index.html"), "utf8")).includes("தமிழ்"), "drafts aren't offered in the switcher");

  const d = await build({ root: src, outDir: out, includeDrafts: true });
  assert.deepEqual(d.locales, ["en", "hi", "ta"]);
  const ta = await readFile(join(out, "ta/ssc/index.html"), "utf8");
  assert.ok(ta.includes(">கோப்பை உருவாக்கு<"), "translated key");
  assert.ok(ta.includes(">Choose a photo<"), "missing key falls back to English");
});

test("shipped JS: only comment-only lines removed (same tokens), SPDX kept, presets module untouched", async (t) => {
  const dir = await tmp();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const r = await build({ outDir: dir });
  const { Linter } = await import("eslint");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tokens = (code, sourceType) => {
    const linter = new Linter({ configType: "flat" });
    const messages = linter.verify(code, { languageOptions: { ecmaVersion: "latest", sourceType } });
    assert.deepEqual(messages.filter((m) => m.fatal), [], "parses");
    return linter.getSourceCode().ast.tokens.map((tk) => `${tk.type}:${tk.value}`);
  };
  const strip = (code) => code.replace(/\.[0-9a-f]{8}\.js(["'])/g, ".js$1");
  for (const [src, hashed] of Object.entries(r.assets).filter(([p]) => p.endsWith(".js"))) {
    const original = await readFile(join(root, src), "utf8");
    const shipped = await readFile(join(dir, hashed), "utf8");
    if (src.startsWith("src/generated/")) {
      assert.equal(shipped, original, src);
      continue;
    }
    assert.match(shipped, /^\/\/ SPDX-License-Identifier: AGPL-3\.0-or-later\n/, src);
    assert.ok(shipped.length < original.length || !/^\s*\/[/*]/m.test(original.slice(original.indexOf("\n"))), src);
    assert.deepEqual(tokens(strip(shipped), "module"), tokens(original, "module"), src);
  }
  const sw = await readFile(join(dir, "sw.js"), "utf8");
  tokens(sw, "script");
});
