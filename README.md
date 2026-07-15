# Document Parser Audit Lab

A local audit application for the unpublished UBC GenAI Toolkit document-parsing package. It accepts PDF, DOCX, and PPTX files, extracts their text to Markdown, describes embedded images through OpenAI, and provides a side-by-side workspace for comparison with manually produced Markdown.

## Setup

Run:

```bash
npm install
npm run dev
```

Open [http://localhost:5731](http://localhost:5731).

No `.env` file is required. The OpenAI API key and model are supplied through the
interface for each app session.

## Desktop app

Run the Electron version during development:

```bash
npm run desktop:dev
```

Create an unpacked app for a quick local test, or a distributable installer:

```bash
npm run desktop:pack
npm run desktop:build
```

## Audit controls

- Separate editable image prompts for PDF, Word, and PowerPoint.
- Optional image descriptions, model name, concurrency, and recurring-decoration threshold.
- Raw Markdown download/copy actions and a manual-reference comparison panel.
- Uploaded files are written only to an OS temporary directory and deleted after each request.

### What comes from the UBC toolkit

The linked `ubc-genai-toolkit-document-parsing` package owns file detection and the actual document work: PDF text and page images, DOCX text and embedded images, PPTX slide text, speaker notes and slide images, image de-duplication, recurring-decoration skipping, bounded image concurrency, and per-slide callbacks. The app does not reimplement those parsers.
