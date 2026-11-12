# Contributing to ExamSnap

Thanks for helping! ExamSnap is only as good as its exam list. The most useful contribution is an exam preset, and adding one takes about ten minutes. You don't need to read any app code.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

- Exam missing? [Request it](https://github.com/GeekyAsif786/ExamSnap/issues/new?template=request-exam.yml&title=%5BExam%5D%20), or add it yourself (below).
- A portal rejected a file? [Report a wrong spec](https://github.com/GeekyAsif786/ExamSnap/issues/new?template=wrong-spec.yml).
- Questions: [Discussions → Q&A](https://github.com/GeekyAsif786/ExamSnap/discussions/categories/q-a).
- Security problems: please report privately, see [SECURITY.md](SECURITY.md).

## Add an exam in 10 minutes

You need [Node.js 22+](https://nodejs.org/) and git. First time only: fork the repo, clone your fork, then run `npm install` in it.

1. **Find the official notification.** Search the exam body's website for the current notification or information bulletin (usually a PDF). Find the section on uploading the photograph and signature. Keep it open.
2. **Run the scaffolder** and answer its questions:
   ```sh
   npm run new-preset
   ```
   It asks for the exam id, name, category, source, then each document (label, kind, size, KB range, file name). Sizes can be typed in pixels, or in centimetres like `3.5cm` and it converts them for you. It writes `presets/<id>.json`, checks it, and updates the README exams table.
3. **Check everything:**
   ```sh
   npm run check
   ```
4. **Try it:**
   ```sh
   npm run preview
   ```
   Open `http://localhost:4173/<id>/`, upload a real photo (yours is fine, it never leaves your computer), and make a file for each document. Check the size and KB in the result.
5. **Open a pull request.** Commit the files the scaffolder lists, push to your fork, and open a PR. The PR template has a short checklist. Keep **"Allow edits by maintainers"** ticked.

The README "Supported exams" table is generated from `presets/`. If it is out of date in your PR, CI shows a warning, not a failure: the maintainer regenerates the table before merging (that's why "Allow edits by maintainers" matters).

Opening an issue with the ["I'm adding an exam"](https://github.com/GeekyAsif786/ExamSnap/issues/new?template=add-preset.yml&title=%5BExam%5D%20) form first lets others know you're on it.

### A filled example

Say the notification says: *photograph 3.5 cm × 4.5 cm, 10–200 KB; signature 3.5 cm × 1.5 cm, 4–30 KB.*

```text
Exam id, kebab-case (used in the URL, e.g. neet-ug): neet-ug
Exam name as candidates know it (e.g. "NEET UG (NTA)"): NEET UG (NTA)
Choose 1–4: 3
Source URL (https://…): https://neet.nta.nic.in/information-bulletin.pdf
Source type [notice/portal/secondary]: notice
Source title: NTA NEET UG 2026 information bulletin
Add another source? (y/N): n
Preset notes (optional): 

Document 1
  Label: Photograph (3.5 × 4.5 cm)
  Kind [photo/signature/thumb/document]: photo
  Width (px or cm): 3.5cm
    → 3.5 cm = 276 px at 200 DPI
  Height (px or cm): 4.5cm
    → 4.5 cm = 354 px at 200 DPI
  Min KB: 10
  Max KB: 200
  File name [photo.jpg]:
  Notes (optional): White background, face covering most of the frame.
Add another document? (y/N): y
…
```

That produces `presets/neet-ug.json`:

```json
{
  "id": "neet-ug",
  "name": "NEET UG (NTA)",
  "category": "Entrance exams",
  "notes": "Pixel sizes are cm at 200 DPI.",
  "last_verified": "2026-11-12",
  "sources": [
    {
      "title": "NTA NEET UG 2026 information bulletin",
      "url": "https://neet.nta.nic.in/information-bulletin.pdf",
      "type": "notice"
    }
  ],
  "documents": [
    {
      "id": "photo",
      "label": "Photograph (3.5 × 4.5 cm)",
      "kind": "photo",
      "width": 276,
      "height": 354,
      "min_kb": 10,
      "max_kb": 200,
      "filename": "photo.jpg",
      "notes": "White background, face covering most of the frame."
    },
    {
      "id": "signature",
      "label": "Signature (3.5 × 1.5 cm)",
      "kind": "signature",
      "width": 276,
      "height": 118,
      "min_kb": 4,
      "max_kb": 30,
      "filename": "signature.jpg"
    }
  ]
}
```

(The URL above is illustrative; always link the real notification.)

Prefer a file to a conversation? Put the same answers in JSON and run `npm run new-preset -- --answers answers.json`. Sizes there can also be `"3.5cm"`.

## Preset rules

- **Official notice first.** Link the official notification and give it type `notice`. Use `portal` for an official site that doesn't itself state the sizes.
- **Secondary sources are allowed, but flagged.** Coaching and news sites get type `secondary`. A preset with no `notice` shows users a "check the official notification" warning and appears as "⚠ Needs verification" in the README.
- **Centimetres convert at 200 DPI.** If the notice gives cm, convert at 200 DPI (the scaffolder does this) and say "Pixel sizes are cm at 200 DPI." in the notes.
- **When sources disagree, use the overlap.** Take the range every source accepts (e.g. 10–20 KB if one says 10–20 and another 5–20) and explain it in `notes`.
- **Never guess a number.** If you can't find a size or KB range in a source, leave the exam as a request and say what's missing. The `needs-notice` label marks these.
- `last_verified` is the date you last checked the numbers against the sources.

## Verify a preset (no coding)

Presets marked "⚠ Needs verification" in the [README](README.md#supported-exams) (and issues labelled [`verify-preset`](https://github.com/GeekyAsif786/ExamSnap/labels/verify-preset)) only have secondary sources. You can fix that without any setup:

1. Find the exam's current official notification.
2. Open the preset's file in `presets/` on GitHub and press the pencil icon to edit.
3. Add the notice to `sources` with type `notice`. Fix any number that doesn't match it. Set `last_verified` to today's date.
4. Commit to a new branch and open a pull request, and say you edited on GitHub.

CI may show a warning that the README exams table is out of date. That's expected for edits made on GitHub, and it doesn't fail your PR: the maintainer regenerates the table before merging, so leave "Allow edits by maintainers" ticked. If you have the repo cloned, `npm run update-readme` fixes it yourself.

## Translations

Coming soon. Hindi is first. Follow issues labelled [`i18n`](https://github.com/GeekyAsif786/ExamSnap/labels/i18n) to help when it opens.

## Code

- **Setup and commands:** see [Development in the README](README.md#development).
- **Style:** `npm run lint` (ESLint) must pass. Plain ES modules, no framework, no runtime dependencies. All user-visible text lives in `src/ui/i18n/en.js` (and its translations next to it).
- **Tests:** every behaviour change comes with tests in the same commit. `npm test` runs the unit tests; `npm run test:e2e` runs Playwright against the built site.
- **Privacy rules:** no network requests at runtime, no analytics, no third-party scripts. The Content-Security-Policy enforces this and the tests check it.
- Keep commits small and focused.

## Reviews

I aim to reply to issues and PRs within 48 hours.

## Licensing of contributions

Inbound = outbound, no CLA. By contributing you agree that:

- code you contribute is licensed under [AGPL-3.0-or-later](LICENSE), like the rest of the code;
- preset data you contribute (`presets/`) is dedicated to the public domain under [CC0-1.0](presets/LICENSE).
