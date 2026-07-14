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


## How the app is assembled

### What this application adds

- A Next.js client interface for drag-and-drop uploads, editable format prompts, a shared editable security prompt, parser settings, status/error handling, and Markdown audit results.
- A server-only upload endpoint at `src/app/api/parse/route.ts` that validates the request, temporarily stores the file, configures the parser, calls OpenAI for images, returns JSON, and deletes the temporary file.
- An OpenAI adapter implementing the toolkit’s provider-agnostic `imageDescriber` callback. The API key never enters browser code.
- Audit tooling for copy/download, parser metrics, and side-by-side comparison with manually produced Markdown.

### What comes from the UBC toolkit

The linked `ubc-genai-toolkit-document-parsing` package owns file detection and the actual document work: PDF text and page images, DOCX text and embedded images, PPTX slide text, speaker notes and slide images, image de-duplication, recurring-decoration skipping, bounded image concurrency, and per-slide callbacks. The app does not reimplement those parsers.

### Request flow

1. The browser sends the selected file, format prompt, shared security prompt, and parser settings as multipart form data.
2. The API route validates the extension and 50 MB limit, then writes the bytes to an OS temporary directory because the toolkit currently accepts a file path.
3. The route creates `DocumentParsingModule` with `imageConcurrency`, `decorativeImageSlideThreshold`, `onSlide`, and an `imageDescriber` function.
4. The toolkit extracts deterministic document text. Whenever it finds a relevant embedded image, it calls the app-provided `imageDescriber`.
5. The app sends the editable security prompt as the OpenAI request instructions, combines the selected format prompt with page/slide context as the image task, and then sends the image to OpenAI. The returned description is handed back to the toolkit and inserted into the correct Markdown location.
6. The API returns the completed Markdown and audit metadata. The browser displays it beside the optional manual reference.
7. The temporary upload directory is deleted in a `finally` block whether parsing succeeds or fails.
