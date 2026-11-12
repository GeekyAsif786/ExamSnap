# ExamSnap

Turn a photo or signature into a JPEG with the exact pixel size and KB range Indian exam portals require. Everything runs in your browser and nothing is uploaded.

**Live:** https://examsnap.asifurrahaman.com/

Works offline after your first visit, and you can install it from your browser menu ("Install app" / "Add to Home Screen").

## Licensing

- Code: [AGPL-3.0-or-later](LICENSE)
- Presets (`presets/`): [CC0-1.0](presets/LICENSE)

The ExamSnap name and logo are not covered by these licenses.

## Development

- `npm install` — install dev dependencies.
- `npx playwright install --with-deps` — install the browsers for end-to-end tests.
- `npm run dev` — serve the app at http://localhost:5173/.
- `npm test` — run the unit tests.
- `npm run build` — build the site into `dist/`.
- `npm run preview` — build, then serve `dist/` at http://localhost:4173/.
- `npm run test:e2e` — run the Playwright tests on Chromium, Firefox and WebKit against the built site.
- `npm run check` — validate presets, check the generated bundle is fresh, and enforce the JS size budget.
- `npm run screenshots` — regenerate the review screenshots in `docs/screenshots/`.
- `npm run icons` — regenerate the app icons and social image in `icons/`.

## Deployment

Every push to `main` runs lint, check and unit tests, builds, and deploys `dist/` to GitHub Pages (`.github/workflows/deploy.yml`).

The build reads two environment variables:

- `BASE_PATH` — URL prefix the site lives under. Default `/`.
- `SITE_ORIGIN` — origin used for canonical, sitemap and social URLs. Default `https://examsnap.asifurrahaman.com`.

The site is served from the custom domain set in Settings → Pages (Actions-based deploys need no `CNAME` file). To serve it somewhere else, set the repository variables `BASE_PATH` and `SITE_ORIGIN` (Settings → Secrets and variables → Actions → Variables) and re-run the deploy; for example `BASE_PATH=/ExamSnap/` and `SITE_ORIGIN=https://geekyasif786.github.io` for the project-site URL.
