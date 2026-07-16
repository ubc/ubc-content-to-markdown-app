# Document Parser Audit Lab

A local audit application for the unpublished UBC GenAI Toolkit document-parsing package. It accepts PDF, DOCX, and PPTX files, extracts their text to Markdown, describes embedded images through OpenAI, and provides a side-by-side workspace for comparison with manually produced Markdown

## Desktop app

### Download and install on a Mac

1. Go to the [Releases page](https://github.com/ubc/ubc-content-to-markdown-app/releases) and open the newest release.
2. Download the DMG that matches your Mac:
   - **`mac-arm64.dmg`** for Apple Silicon Macs (M1, M2, M3, M4, or later).
   - **`mac-x64.dmg`** for Intel Macs.

   To check which you have, choose the Apple menu () > **About This Mac**. It
   will show either a **Chip** (Apple Silicon) or a **Processor** (Intel).
3. Open the downloaded DMG, then drag **Document Parser Audit Lab** into the
   **Applications** folder.

### First time opening the app

This application was created by the Learning Technology Innovation Centre (LTIC).
Because LTIC does not currently have an Apple Developer signing certificate,
macOS may warn that the downloaded app is damaged or cannot be opened. You need
to trust this copy of the application manually once.

First, make sure the app has been moved to **Applications**. Then open the
**Terminal** app (Command + space, type in terminal or from the top right hand magnifier), paste the following command, and press Return:

```bash
xattr -dr com.apple.quarantine "/Applications/Document Parser Audit Lab.app"
```

You can now open **Document Parser Audit Lab** normally from Applications. Only
run this command for a copy you downloaded from the official Releases page.

### OpenAI API key

Image descriptions require an OpenAI API key. LTIC may provide one; otherwise,
you can create and use your own key through the
[OpenAI API key page](https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key).

Your key is stored securely on your Mac and is restored when you reopen the
application. You can remove it at any time with **Forget saved key**. If you use
your own key, OpenAI usage charges may apply.

### Large PDFs

Large PDFs, especially files larger than 4 MB with many images, can take a long
time to process. DOCX and PowerPoint files generally process more quickly. This
is a known limitation that LTIC is working to improve.

### Updating the app

When a new version is available, download the newest DMG from the Releases page,
open it, and drag the new app into **Applications**, replacing the existing copy.

If macOS shows the same security warning for the new version, run the Terminal
command above again. To confirm the installed version, right-click the app,
choose **Get Info**, and check that its version matches the release you downloaded.

## Setup (DEVELOPER INSTRUCTIONS)

Run:

```bash
npm install
npm run dev
```

Open [http://localhost:5731](http://localhost:5731).

No `.env` file is required. The OpenAI API key and model are supplied through the
interface for each app session.

In the Electron desktop app, the API key is encrypted with the operating system's
secure credential store and restored on the next launch. Users can remove it with
the **Forget saved key** control.



### Build from source (DEVELOPER INSTRUCTIONS)

Run the Electron version during development:

```bash
npm run desktop:dev
```

Create an unpacked app for a quick local test, or a distributable installer:

```bash
npm run desktop:pack
npm run desktop:build
```

### What comes from the UBC toolkit

The linked `ubc-genai-toolkit-document-parsing` package owns file detection and the actual document work: PDF text and page images, DOCX text and embedded images, PPTX slide text, speaker notes and slide images, image de-duplication, recurring-decoration skipping, bounded image concurrency, and per-slide callbacks. The app does not reimplement those parsers.
