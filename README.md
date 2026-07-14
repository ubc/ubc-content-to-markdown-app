# Document Parser Audit Lab

A local audit application for the unpublished `0.3.0` version of the UBC GenAI Toolkit document-parsing package. It accepts PDF, DOCX, and PPTX files, extracts their text to Markdown, describes embedded images through OpenAI, and provides a side-by-side workspace for comparison with manually produced Markdown.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Add your `OPENAI_API_KEY`.
3. Run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Local toolkit dependency

`package.json` links directly to:

```text
/Users/maziyardowlatabadibazaz/ubc-genai-toolkit-document-parsing
```

This intentionally exercises the local `0.3.0` build rather than the older published package. If the toolkit source changes, run `npm run build` in the toolkit directory before testing it here.

## Audit controls

- Separate editable image prompts for PDF, Word, and PowerPoint.
- Optional image descriptions, model name, concurrency, and recurring-decoration threshold.
- Raw Markdown download/copy actions and a manual-reference comparison panel.
- Uploaded files are written only to an OS temporary directory and deleted after each request.

Text extraction itself is deterministic. The editable prompts only affect descriptions generated for embedded images.
