# ExamSnap

Turn a photo or signature into a JPEG with the exact pixel size and KB range Indian exam portals require. Everything runs in your browser and nothing is uploaded.

## Licensing

- Code: [AGPL-3.0-or-later](LICENSE)
- Presets (`presets/`): [CC0-1.0](presets/LICENSE)

The ExamSnap name and logo are not covered by these licenses.

## Development

- `npm install` — install dev dependencies.
- `npx playwright install --with-deps` — install the browsers for end-to-end tests.
- `npm run dev` — serve the app at http://localhost:5173/.
- `npm test` — run the unit tests.
- `npm run test:e2e` — run the Playwright tests on Chromium, Firefox and WebKit.
- `npm run check` — validate presets, check the generated bundle is fresh, and enforce the JS size budget.
- `npm run screenshots` — regenerate the review screenshots in `docs/screenshots/`.
