import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
import packageInfo from "../../../../package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 12_000;
const MAX_API_KEY_LENGTH = 512;
const NO_CONTENT_VALUES = new Set(["NOCONTENT", "NOTHING", "NONE", "NA"]);

interface ParserPrompts {
  pdf: string;
  docx: string;
  pptx: string;
}

interface ParserDiagnostic {
  level: "warning" | "error";
  message: string;
  detail: string | null;
  count: number;
}

function diagnosticDetail(value: unknown) {
  if (!value) return null;
  if (value instanceof Error) {
    const error = value as Error & { code?: unknown; status?: unknown };
    const qualifiers = [error.code, error.status]
      .filter((item) => typeof item === "string" || typeof item === "number")
      .map(String);
    return [error.name, error.message, qualifiers.length ? `(${qualifiers.join(", ")})` : ""]
      .filter(Boolean)
      .join(": ")
      .slice(0, 1_000);
  }
  if (typeof value === "string") return value.slice(0, 1_000);
  return String(value).slice(0, 1_000);
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

async function configurePdfWorker() {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<{
    GlobalWorkerOptions: { workerSrc: string };
  }>;
  const pdfjs = await dynamicImport("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs",
  );
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
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
  const submittedApiKey = formData.get("apiKey");
  if (typeof submittedApiKey === "string" && submittedApiKey.length > MAX_API_KEY_LENGTH) {
    return jsonError("The OpenAI API key is too long.", 400);
  }
  const apiKey = typeof submittedApiKey === "string" ? submittedApiKey.trim() : "";
  if (includeImages && !apiKey) {
    return jsonError(
      "Enter an OpenAI API key in the app, or turn off image descriptions.",
      400,
    );
  }

  const submittedModel = formData.get("model");
  const model =
    (typeof submittedModel === "string" && submittedModel.trim()) || "gpt-4.1-mini";
  const imageConcurrency = positiveInteger(formData.get("imageConcurrency"), 5, 12);
  const decorativeThreshold = positiveInteger(formData.get("decorativeThreshold"), 5, 50);

  const startedAt = Date.now();
  const parsedSlides: ParsedSlide[] = [];
  let imageCalls = 0;
  let describedImages = 0;
  let imageFailures = 0;
  let emptyImageResponses = 0;
  let detectedImages: number | null = null;
  let pdfWorkerConfigured: boolean | null = null;
  const parserDiagnostics: ParserDiagnostic[] = [];

  const recordParserDiagnostic = (
    level: ParserDiagnostic["level"],
    message: string,
    metadata?: Record<string, unknown>,
  ) => {
    const detail = diagnosticDetail(metadata?.error);
    const existing = parserDiagnostics.find(
      (item) => item.level === level && item.message === message && item.detail === detail,
    );
    if (existing) {
      existing.count += 1;
      return;
    }
    if (parserDiagnostics.length >= 20) return;
    parserDiagnostics.push({
      level,
      message,
      detail,
      count: 1,
    });
  };

  const parserLogger = {
    debug(message: string, metadata?: Record<string, unknown>) {
      if (message === "PDF image de-duplication summary") {
        const total = metadata?.totalImagePlacements;
        if (typeof total === "number") detectedImages = total;
      }
    },
    info() {},
    warn(message: string, metadata?: Record<string, unknown>) {
      recordParserDiagnostic("warning", message, metadata);
    },
    error(message: string, metadata?: Record<string, unknown>) {
      recordParserDiagnostic("error", message, metadata);
    },
  };
  const openai = includeImages && apiKey ? new OpenAI({ apiKey }) : null;

  const imageDescriber = openai
    ? async (image: EmbeddedImage) => {
        imageCalls += 1;
        try {
          const response = await openai.responses.create({
            model,
            instructions: securityPrompt,
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: `${prompts[documentKind]}\n\n${fileContext(image)}`,
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
          else emptyImageResponses += 1;
          return description;
        } catch (error) {
          imageFailures += 1;
          throw error;
        }
      }
    : undefined;

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "document-audit-"));
  const temporaryFile = path.join(temporaryDirectory, `upload.${documentKind}`);

  try {
    await writeFile(temporaryFile, Buffer.from(await upload.arrayBuffer()));

    if (documentKind === "pdf" && imageDescriber) {
      try {
        await configurePdfWorker();
        pdfWorkerConfigured = true;
      } catch (error) {
        pdfWorkerConfigured = false;
        recordParserDiagnostic("error", "PDF worker configuration failed", { error });
      }
    }

    const parser = new DocumentParsingModule({
      logger: parserLogger,
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
        imageFailures,
        emptyImageResponses,
        detectedImages,
        imageDescriptionsEnabled: includeImages,
        pdfWorkerConfigured,
        parserDiagnostics,
        slideCount: parsedSlides.length,
        elapsedMs: Date.now() - startedAt,
        model: includeImages ? model : null,
        toolkitVersion: "0.3.0-local",
        appVersion: process.env.DESKTOP_APP_VERSION || packageInfo.version,
        runtime: `${process.platform}-${process.arch}`,
      },
    });
  } catch (error) {
    console.error("Document parsing failed", error);
    const message = error instanceof Error ? error.message : "Unknown parser error";
    const diagnostic = [...parserDiagnostics]
      .reverse()
      .find((item) => item.detail);
    const detail = diagnostic
      ? ` (${diagnostic.message}: ${diagnostic.detail})`
      : "";
    return jsonError(`Parsing failed: ${message}${detail}`, 500);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
