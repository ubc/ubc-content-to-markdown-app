import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import OpenAI from "openai";
import {
  DocumentParsingModule,
  type EmbeddedImage,
  type ParsedSlide,
} from "ubc-genai-toolkit-document-parsing";
import {
  DEFAULT_PROMPTS,
  DEFAULT_SECURITY_PROMPT,
  extensionToDocumentKind,
  type DocumentKind,
} from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 12_000;
const NO_CONTENT_VALUES = new Set(["NOCONTENT", "NOTHING", "NONE", "NA"]);

interface ParserPrompts {
  pdf: string;
  docx: string;
  pptx: string;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function parsePrompts(value: FormDataEntryValue | null): ParserPrompts {
  if (typeof value !== "string") {
    return DEFAULT_PROMPTS;
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw new Error("The prompt settings are not valid JSON.");
  }

  if (!candidate || typeof candidate !== "object") {
    throw new Error("The prompt settings are invalid.");
  }

  const record = candidate as Record<string, unknown>;
  const prompts = { ...DEFAULT_PROMPTS };
  for (const kind of Object.keys(prompts) as DocumentKind[]) {
    const prompt = record[kind];
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new Error(`The ${kind.toUpperCase()} prompt cannot be empty.`);
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`The ${kind.toUpperCase()} prompt is too long.`);
    }
    prompts[kind] = prompt.trim();
  }
  return prompts;
}

function parseSecurityPrompt(value: FormDataEntryValue | null) {
  const prompt = typeof value === "string" ? value.trim() : DEFAULT_SECURITY_PROMPT;
  if (!prompt) throw new Error("The security prompt cannot be empty.");
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error("The security prompt is too long.");
  }
  return prompt;
}

function fileContext(image: EmbeddedImage) {
  if (image.slideNumber) return `This image is from slide ${image.slideNumber}.`;
  if (image.pageNumber) return `This image is from page ${image.pageNumber}.`;
  return "This image is embedded in the document.";
}

function normalizeDescription(value: string) {
  const content = value.trim();
  const normalized = content.replace(/[^a-z]/gi, "").toUpperCase();
  return !content || NO_CONTENT_VALUES.has(normalized) ? "" : content;
}

function positiveInteger(value: FormDataEntryValue | null, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("The upload could not be read. Try the file again.", 400);
  }

  const upload = formData.get("file");
  if (!(upload instanceof File)) {
    return jsonError("Choose a PDF, DOCX, or PPTX file to parse.", 400);
  }
  if (upload.size === 0) return jsonError("The selected file is empty.", 400);
  if (upload.size > MAX_FILE_SIZE) return jsonError("Files must be 50 MB or smaller.", 413);

  const documentKind = extensionToDocumentKind(upload.name);
  if (!documentKind) {
    return jsonError("Only .pdf, .docx, and .pptx files are supported.", 415);
  }

  let prompts: ParserPrompts;
  let securityPrompt: string;
  try {
    prompts = parsePrompts(formData.get("prompts"));
    securityPrompt = parseSecurityPrompt(formData.get("securityPrompt"));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid prompts.", 400);
  }

  const includeImages = formData.get("includeImages") !== "false";
  const apiKey = process.env.OPENAI_API_KEY;
  if (includeImages && !apiKey) {
    return jsonError(
      "OPENAI_API_KEY is missing. Add it to .env.local, or turn off image descriptions.",
      503,
    );
  }

  const model =
    (typeof formData.get("model") === "string" && String(formData.get("model")).trim()) ||
    process.env.OPENAI_MODEL ||
    "gpt-4.1-mini";
  const imageConcurrency = positiveInteger(formData.get("imageConcurrency"), 5, 12);
  const decorativeThreshold = positiveInteger(formData.get("decorativeThreshold"), 5, 50);

  const startedAt = Date.now();
  const parsedSlides: ParsedSlide[] = [];
  let imageCalls = 0;
  let describedImages = 0;
  const openai = includeImages && apiKey ? new OpenAI({ apiKey }) : null;

  const imageDescriber = openai
    ? async (image: EmbeddedImage) => {
        imageCalls += 1;
        const response = await openai.responses.create({
          model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `${prompts[documentKind]}\n\n${securityPrompt}\n\n${fileContext(image)}`,
                },
                {
                  type: "input_image",
                  image_url: `data:${image.mimeType};base64,${image.data.toString("base64")}`,
                  detail: "high",
                },
              ],
            },
          ],
          max_output_tokens: 1000,
        });
        const description = normalizeDescription(response.output_text || "");
        if (description) describedImages += 1;
        return description;
      }
    : undefined;

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "document-audit-"));
  const temporaryFile = path.join(temporaryDirectory, `upload.${documentKind}`);

  try {
    await writeFile(temporaryFile, Buffer.from(await upload.arrayBuffer()));

    const parser = new DocumentParsingModule({
      imageDescriber,
      imageConcurrency,
      decorativeImageSlideThreshold: decorativeThreshold,
      onSlide: (slide) => {
        parsedSlides.push(slide);
      },
    });

    const result = await parser.parse({ filePath: temporaryFile }, "markdown");
    const markdown = result.content.trim();
    const words = markdown ? markdown.split(/\s+/).length : 0;

    return Response.json({
      markdown,
      metadata: {
        fileName: upload.name,
        fileType: documentKind,
        fileSize: upload.size,
        detectedInputType: result.metadata?.detectedInputType ?? documentKind,
        characters: markdown.length,
        words,
        imageCalls,
        describedImages,
        slideCount: parsedSlides.length,
        elapsedMs: Date.now() - startedAt,
        model: includeImages ? model : null,
        toolkitVersion: "0.3.0-local",
      },
    });
  } catch (error) {
    console.error("Document parsing failed", error);
    const message = error instanceof Error ? error.message : "Unknown parser error";
    return jsonError(`Parsing failed: ${message}`, 500);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
