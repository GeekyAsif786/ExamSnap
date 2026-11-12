// SPDX-License-Identifier: CC0-1.0
// GENERATED FILE — DO NOT EDIT BY HAND.
// Built from presets/*.json by scripts/bundle-presets.mjs (npm run build:presets).
// `npm run check` fails if this file is out of date.

export const PRESETS = [
  {
    "id": "banking-ibps",
    "name": "Banking — IBPS PO / Clerk / RRB / SO, RBI, PSU banks",
    "category": "Banking",
    "notes": "Standard IBPS-style annex used by most bank recruitments. Some individual banks allow a wider signature range; 10–20 KB is accepted by all of them.",
    "last_verified": "2026-11-11",
    "sources": [
      {
        "title": "RBI recruitment Annex I — guidelines for scanning photograph & signature",
        "url": "https://website.rbi.org.in/documents/87730/39016390/RPJECE07012019_AN1.pdf",
        "type": "notice"
      },
      {
        "title": "Punjab & Sind Bank — upload guidelines (declaration spec)",
        "url": "https://punjabandsind.bank.in/system/uploads/document/2150_2024101518104187881.pdf",
        "type": "notice"
      },
      {
        "title": "PracticeMock — IBPS RRB photo & signature size 2026",
        "url": "https://www.practicemock.com/blog/ibps-rrb-photo-and-signature-size/",
        "type": "secondary"
      }
    ],
    "documents": [
      {
        "id": "photo",
        "label": "Photograph",
        "kind": "photo",
        "width": 200,
        "height": 230,
        "min_kb": 20,
        "max_kb": 50,
        "filename": "photo.jpg"
      },
      {
        "id": "signature",
        "label": "Signature",
        "kind": "signature",
        "width": 140,
        "height": 60,
        "min_kb": 10,
        "max_kb": 20,
        "filename": "signature.jpg",
        "notes": "Black ink on white paper. Signatures in CAPITAL LETTERS are not accepted."
      },
      {
        "id": "thumb",
        "label": "Left thumb impression",
        "kind": "thumb",
        "width": 240,
        "height": 240,
        "min_kb": 20,
        "max_kb": 50,
        "filename": "thumb.jpg"
      },
      {
        "id": "declaration",
        "label": "Handwritten declaration",
        "kind": "document",
        "width": 800,
        "height": 400,
        "min_kb": 50,
        "max_kb": 100,
        "filename": "declaration.jpg"
      }
    ]
  },
  {
    "id": "jee-main",
    "name": "JEE Main (NTA)",
    "category": "Entrance exams",
    "notes": "Sources disagree: photo 10–200 KB vs 10–300 KB, signature 4–30 KB vs 10–50 KB. ExamSnap targets the overlap (photo 10–200, signature 10–30) so the file is valid under every version. Pixel sizes are cm at 200 DPI.",
    "last_verified": "2026-11-11",
    "sources": [
      {
        "title": "CollegeDekho — JEE Main 2026 documents (signature 4–30 KB)",
        "url": "https://www.collegedekho.com/news/jee-main-2026-registration-list-of-important-documents-required-72297",
        "type": "secondary"
      },
      {
        "title": "Physics Wallah — JEE Main documents (photo 10–300 KB)",
        "url": "https://www.pw.live/iit-jee/exams/list-of-documents-required-to-apply-for-jee-main",
        "type": "secondary"
      },
      {
        "title": "JEE Main official site",
        "url": "https://jeemain.nta.nic.in",
        "type": "portal"
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
        "filename": "Photograph.jpg",
        "notes": "Colour photo, white background, ears visible."
      },
      {
        "id": "signature",
        "label": "Signature (3.5 × 1.5 cm)",
        "kind": "signature",
        "width": 276,
        "height": 118,
        "min_kb": 10,
        "max_kb": 30,
        "filename": "Signature.jpg"
      }
    ]
  },
  {
    "id": "ssc",
    "name": "SSC — CGL / CHSL / MTS / GD / CPO",
    "category": "Government jobs",
    "notes": "Recent SSC forms capture the photograph live inside the application; the photo preset is for forms that still ask for an upload. Signature dimensions differ between notices (4×2 cm, 6×2 cm); the 10–20 KB range is consistent and is what the portal checks. Pixel sizes are cm at 200 DPI.",
    "last_verified": "2026-11-11",
    "sources": [
      {
        "title": "Physics Wallah — SSC CHSL 2026 photo & signature size",
        "url": "https://www.pw.live/ssc/exams/ssc-chsl-photo-and-signature-size",
        "type": "secondary"
      },
      {
        "title": "Testbook — SSC GD signature & photo size",
        "url": "https://testbook.com/news/ssc-gd-signature-photo-size/",
        "type": "secondary"
      },
      {
        "title": "Adda247 — SSC GD photo and signature size 2026",
        "url": "https://www.adda247.com/exams/ssc/ssc-gd-photo-and-signature-size",
        "type": "secondary"
      }
    ],
    "documents": [
      {
        "id": "photo",
        "label": "Photograph (3.5 × 4.5 cm)",
        "kind": "photo",
        "width": 276,
        "height": 354,
        "min_kb": 20,
        "max_kb": 50,
        "filename": "photo.jpg",
        "notes": "White background, recent photo. Some notices require the date the photo was taken printed on it."
      },
      {
        "id": "signature",
        "label": "Signature (6.0 × 2.0 cm)",
        "kind": "signature",
        "width": 472,
        "height": 157,
        "min_kb": 10,
        "max_kb": 20,
        "filename": "signature.jpg",
        "notes": "Running hand, not capitals. Blurred or miniature signatures are rejected."
      }
    ]
  },
  {
    "id": "upsc-cse",
    "name": "UPSC — Civil Services (and other UPSC exams)",
    "category": "Government jobs",
    "notes": "2026 notices: photo 20–200 KB; signature (signed three times on one sheet) 20–100 KB with both sides between 350 and 500 px. The photo has no prescribed pixel size; 400×500 is within every rule UPSC has used. The photo-ID size (800×500) is an ExamSnap default, not a UPSC requirement. UPSC also captures a live photo that must match the uploaded one.",
    "last_verified": "2026-11-11",
    "sources": [
      {
        "title": "ExamDetail — UPSC CSE 2026 sizes (cites Notice No. 05/2026-CSE)",
        "url": "https://www.examdetail.in/tools/exam-photo-resizer/upsc-cse",
        "type": "secondary"
      },
      {
        "title": "Vajiram & Ravi — UPSC photo and signature guidelines 2026",
        "url": "https://vajiramandravi.com/upsc-exam/upsc-photo-and-signature-guidelines/",
        "type": "secondary"
      },
      {
        "title": "UPSC online application portal",
        "url": "https://upsconline.nic.in",
        "type": "portal"
      }
    ],
    "documents": [
      {
        "id": "photo",
        "label": "Photograph",
        "kind": "photo",
        "width": 400,
        "height": 500,
        "min_kb": 20,
        "max_kb": 200,
        "filename": "photo.jpg",
        "notes": "Face should cover about 3/4 of the photo."
      },
      {
        "id": "signature",
        "label": "Signature ×3 (one image)",
        "kind": "signature",
        "width": 500,
        "height": 350,
        "min_kb": 20,
        "max_kb": 100,
        "filename": "signature.jpg",
        "notes": "Sign three times on white paper with a black pen; scan as one image."
      },
      {
        "id": "photo-id",
        "label": "Photo ID card",
        "kind": "document",
        "width": 800,
        "height": 500,
        "min_kb": 20,
        "max_kb": 200,
        "filename": "id_card.jpg"
      }
    ]
  }
];
