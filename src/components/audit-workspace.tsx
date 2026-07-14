"use client";

import { useMemo, useRef, useState } from "react";
import {
  DEFAULT_PROMPTS,
  DOCUMENT_LABELS,
  extensionToDocumentKind,
  type DocumentKind,
} from "@/lib/prompts";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  SparkIcon,
  UploadIcon,
  XIcon,
} from "@/components/icons";

interface ParseMetadata {
  fileName: string;
  fileType: DocumentKind;
  fileSize: number;
  detectedInputType: string;
  characters: number;
  words: number;
  imageCalls: number;
  describedImages: number;
  slideCount: number;
  elapsedMs: number;
  model: string | null;
  toolkitVersion: string;
}

interface ParseResult {
  markdown: string;
  metadata: ParseMetadata;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function lineComparison(generated: string, manual: string) {
  const clean = (value: string) =>
    value.split("\n").map((line) => line.trim()).filter(Boolean);
  const generatedLines = clean(generated);
  const manualLines = clean(manual);
  const generatedSet = new Set(generatedLines);
  const manualSet = new Set(manualLines);
  const matches = generatedLines.filter((line) => manualSet.has(line)).length;
  return {
    matches,
    generatedOnly: generatedLines.filter((line) => !manualSet.has(line)).length,
    manualOnly: manualLines.filter((line) => !generatedSet.has(line)).length,
  };
}

export function AuditWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [prompts, setPrompts] = useState(DEFAULT_PROMPTS);
  const [activePrompt, setActivePrompt] = useState<DocumentKind>("pdf");
  const [includeImages, setIncludeImages] = useState(true);
  const [model, setModel] = useState("gpt-4.1-mini");
  const [concurrency, setConcurrency] = useState(5);
  const [decorativeThreshold, setDecorativeThreshold] = useState(5);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [manualMarkdown, setManualMarkdown] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const comparison = useMemo(
    () => lineComparison(result?.markdown ?? "", manualMarkdown),
    [result, manualMarkdown],
  );

  function chooseFile(candidate: File | null) {
    setError("");
    setResult(null);
    if (!candidate) return;
    const kind = extensionToDocumentKind(candidate.name);
    if (!kind) {
      setFile(null);
      setError("Choose a PDF, DOCX, or PPTX file.");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("Files must be 50 MB or smaller.");
      return;
    }
    setFile(candidate);
    setActivePrompt(kind);
  }

  async function parseDocument() {
    if (!file) {
      setError("Choose a document before running the parser.");
      return;
    }

    setError("");
    setIsParsing(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("prompts", JSON.stringify(prompts));
    formData.append("includeImages", String(includeImages));
    formData.append("model", model);
    formData.append("imageConcurrency", String(concurrency));
    formData.append("decorativeThreshold", String(decorativeThreshold));

    try {
      const response = await fetch("/api/parse", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The parser could not finish.");
      setResult(payload as ParseResult);
    } catch (parseError) {
      setResult(null);
      setError(parseError instanceof Error ? parseError.message : "The parser could not finish.");
    } finally {
      setIsParsing(false);
    }
  }

  async function copyMarkdown() {
    if (!result) return;
    await navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadMarkdown() {
    if (!result) return;
    const blob = new Blob([result.markdown], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${result.metadata.fileName.replace(/\.[^.]+$/, "")}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="min-h-screen bg-[#f5f3ed] text-[#20211f]">
      <header className="border-b border-[#d9d6cc] bg-[#f5f3ed]/95">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 md:px-10">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#183b32] text-[#eff6dd]">
              <FileIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.02em]">Document Parser Audit Lab</p>
              <p className="text-xs text-[#6c6e68]">UBC GenAI Toolkit evaluation workspace</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="h-2 w-2 rounded-full bg-[#3f8a68] shadow-[0_0_0_4px_rgba(63,138,104,0.12)]" />
            <span className="font-mono text-xs text-[#5d625e]">local toolkit · v0.3.0</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-10 md:px-10 md:py-14">
        <section className="mb-9 max-w-3xl">
          <div className="mb-4 flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-[#3f6f5e]">
            <span className="h-px w-7 bg-[#6b9685]" /> Audit surface
          </div>
          <h1 className="font-display text-4xl leading-[1.04] tracking-[-0.045em] text-[#1d2924] md:text-6xl">
            Put document parsing<br className="hidden sm:block" /> under a microscope.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#62655f] md:text-lg">
            Upload a course document, tune how embedded images are described, and inspect the exact Markdown students can compare with their manual work.
          </p>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(390px,0.72fr)]">
          <section className="overflow-hidden rounded-2xl border border-[#d4d0c5] bg-[#fbfaf6] shadow-[0_18px_60px_rgba(55,53,45,0.06)]">
            <div className="flex items-center justify-between border-b border-[#ddd9cf] px-5 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#183b32] font-mono text-xs text-white">01</span>
                <div>
                  <h2 className="text-sm font-semibold">Source document</h2>
                  <p className="text-xs text-[#777970]">PDF, Word, or PowerPoint · up to 50 MB</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {(["PDF", "DOCX", "PPTX"] as const).map((type) => (
                  <span key={type} className="rounded-md border border-[#d8d5ca] bg-white px-2 py-1 font-mono text-[10px] text-[#6f716c]">.{type.toLowerCase()}</span>
                ))}
              </div>
            </div>

            <div className="p-5 md:p-6">
              {file ? (
                <div className="flex min-h-52 items-center justify-center rounded-xl border border-[#b9c7bf] bg-[#f2f7f2] p-7">
                  <div className="flex w-full max-w-lg items-center gap-4">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#dfece2] text-[#2e6b52]">
                      <FileIcon className="h-7 w-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{file.name}</p>
                      <p className="mt-1 font-mono text-xs text-[#68716b]">{formatBytes(file.size)} · ready to parse</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove selected file"
                      onClick={() => setFile(null)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-[#cbd5ce] bg-white text-[#68716b] transition hover:border-[#9eaaa3] hover:text-[#253d32]"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    chooseFile(event.dataTransfer.files[0] ?? null);
                  }}
                  className={`group flex min-h-52 w-full flex-col items-center justify-center rounded-xl border border-dashed p-7 text-center transition ${isDragging ? "border-[#39765e] bg-[#edf5ee]" : "border-[#bbb9b0] bg-[#f7f6f1] hover:border-[#739080] hover:bg-[#f2f6ef]"}`}
                >
                  <span className="mb-4 grid h-12 w-12 place-items-center rounded-full border border-[#d2d4cb] bg-white text-[#315f4e] shadow-sm transition group-hover:-translate-y-0.5">
                    <UploadIcon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold">Drop a document here</span>
                  <span className="mt-1.5 text-sm text-[#74766f]">or click to browse from your computer</span>
                </button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="sr-only"
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              />

              {error && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-[#e1b8ae] bg-[#fff1ed] px-3.5 py-3 text-sm text-[#914434]">
                  <XIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#d4d0c5] bg-[#fbfaf6] shadow-[0_18px_60px_rgba(55,53,45,0.06)]">
            <div className="flex items-center gap-3 border-b border-[#ddd9cf] px-5 py-4 md:px-6">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#dce9ce] font-mono text-xs text-[#264f3f]">02</span>
              <div>
                <h2 className="text-sm font-semibold">Image prompt</h2>
                <p className="text-xs text-[#777970]">Tune the selected format before each run</p>
              </div>
            </div>

            <div className="p-5 md:p-6">
              <div className="mb-4 grid grid-cols-3 rounded-lg bg-[#eceae3] p-1" role="tablist" aria-label="Document prompt type">
                {(Object.keys(DOCUMENT_LABELS) as DocumentKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={activePrompt === kind}
                    onClick={() => setActivePrompt(kind)}
                    className={`rounded-md px-3 py-2 text-xs font-medium transition ${activePrompt === kind ? "bg-white text-[#244d3e] shadow-sm" : "text-[#70736c] hover:text-[#30332f]"}`}
                  >
                    {DOCUMENT_LABELS[kind]}
                  </button>
                ))}
              </div>
              <textarea
                aria-label={`${DOCUMENT_LABELS[activePrompt]} image description prompt`}
                value={prompts[activePrompt]}
                onChange={(event) => setPrompts((current) => ({ ...current, [activePrompt]: event.target.value }))}
                className="min-h-64 w-full resize-y rounded-xl border border-[#d5d2c8] bg-white px-4 py-3.5 text-[13px] leading-6 text-[#3b3d39] outline-none transition placeholder:text-[#a6a69f] focus:border-[#6b9483] focus:ring-4 focus:ring-[#6b9483]/10"
                spellCheck
              />
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[#85867f]">
                <span>Used only for embedded image descriptions</span>
                <span>{prompts[activePrompt].length.toLocaleString()} chars</span>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border border-[#d4d0c5] bg-[#fbfaf6]">
          <div className="grid divide-y divide-[#ddd9cf] lg:grid-cols-[1fr_auto] lg:divide-x lg:divide-y-0">
            <div className="grid gap-5 p-5 md:grid-cols-3 md:p-6">
              <label className="flex items-center justify-between gap-4 rounded-xl border border-[#d8d5cb] bg-white px-4 py-3">
                <span>
                  <span className="block text-xs font-semibold">Describe images</span>
                  <span className="mt-0.5 block text-[11px] text-[#777970]">Uses your OpenAI key</span>
                </span>
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(event) => setIncludeImages(event.target.checked)}
                  className="h-4 w-4 accent-[#265e49]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold">OpenAI model</span>
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={!includeImages}
                  className="h-10 w-full rounded-lg border border-[#d4d1c7] bg-white px-3 font-mono text-xs outline-none focus:border-[#6b9483] disabled:bg-[#efeee9] disabled:text-[#9a9a94]"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold">Concurrency</span>
                  <input type="number" min="1" max="12" value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} className="h-10 w-full rounded-lg border border-[#d4d1c7] bg-white px-3 font-mono text-xs outline-none focus:border-[#6b9483]" />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold">Repeat skip</span>
                  <input type="number" min="1" max="50" value={decorativeThreshold} onChange={(event) => setDecorativeThreshold(Number(event.target.value))} className="h-10 w-full rounded-lg border border-[#d4d1c7] bg-white px-3 font-mono text-xs outline-none focus:border-[#6b9483]" />
                </label>
              </div>
            </div>
            <div className="flex items-center p-5 md:p-6">
              <button
                type="button"
                onClick={parseDocument}
                disabled={!file || isParsing}
                className="flex h-12 w-full min-w-52 items-center justify-center gap-2 rounded-xl bg-[#183b32] px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(24,59,50,0.2)] transition hover:bg-[#244e42] disabled:cursor-not-allowed disabled:bg-[#a7aba5] disabled:shadow-none"
              >
                {isParsing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <SparkIcon className="h-4 w-4" />}
                {isParsing ? "Parsing document…" : "Run parser audit"}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-[#3f6f5e]">
                <span className="h-px w-7 bg-[#6b9685]" /> Audit output
              </div>
              <h2 className="font-display text-3xl tracking-[-0.035em] text-[#1d2924]">Compare the extraction</h2>
            </div>
            {result && (
              <div className="hidden items-center gap-2 sm:flex">
                <button type="button" onClick={copyMarkdown} className="tool-button">
                  {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button type="button" onClick={downloadMarkdown} className="tool-button">
                  <DownloadIcon className="h-4 w-4" /> Download .md
                </button>
              </div>
            )}
          </div>

          {result ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  ["Words", result.metadata.words.toLocaleString()],
                  ["Images described", String(result.metadata.describedImages)],
                  ["Image calls", String(result.metadata.imageCalls)],
                  [result.metadata.slideCount ? "Slides" : "Format", result.metadata.slideCount ? String(result.metadata.slideCount) : result.metadata.fileType.toUpperCase()],
                  ["Elapsed", `${(result.metadata.elapsedMs / 1000).toFixed(1)}s`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[#d5d2c8] bg-[#fbfaf6] px-4 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#85867f]">{label}</p>
                    <p className="mt-1 text-lg font-semibold text-[#273a31]">{value}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#cbc8be] bg-[#fbfaf6]">
                <div className="grid divide-y divide-[#cbc8be] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                  <div>
                    <div className="flex items-center justify-between border-b border-[#ddd9cf] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#3f8a68]" />
                        <span className="text-xs font-semibold">Generated Markdown</span>
                      </div>
                      <span className="font-mono text-[10px] text-[#888982]">{result.metadata.toolkitVersion}</span>
                    </div>
                    <textarea readOnly value={result.markdown} aria-label="Generated Markdown" className="audit-editor bg-[#f8f7f2]" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between border-b border-[#ddd9cf] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#c68c47]" />
                        <span className="text-xs font-semibold">Manual reference</span>
                      </div>
                      <span className="font-mono text-[10px] text-[#888982]">paste student work</span>
                    </div>
                    <textarea value={manualMarkdown} onChange={(event) => setManualMarkdown(event.target.value)} placeholder="Paste the manually produced Markdown here for a line-level comparison…" aria-label="Manual reference Markdown" className="audit-editor bg-white" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#ddd9cf] bg-[#f0efe9] px-4 py-3 font-mono text-[11px] text-[#686b65]">
                  <span><strong className="text-[#316c53]">{comparison.matches}</strong> matching lines</span>
                  <span><strong className="text-[#6e5f39]">{comparison.generatedOnly}</strong> generated only</span>
                  <span><strong className="text-[#8b5548]">{comparison.manualOnly}</strong> manual only</span>
                  <span className="ml-auto hidden text-[#8b8c85] md:inline">comparison ignores blank lines and surrounding whitespace</span>
                </div>
              </div>
            </>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#c7c4ba] bg-[#efeee8]/55 px-6 text-center">
              <div className="max-w-sm">
                <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full border border-[#d3d1c7] bg-[#faf9f5] text-[#7c837d]">
                  <FileIcon className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-[#555954]">No audit run yet</p>
                <p className="mt-1.5 text-sm leading-6 text-[#85867f]">Your extracted Markdown, parser metrics, and manual comparison workspace will appear here.</p>
              </div>
            </div>
          )}
        </section>

        <footer className="mt-10 flex flex-col justify-between gap-2 border-t border-[#d6d3c9] pt-5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#8b8c85] sm:flex-row">
          <span>Local evaluation only · files are removed after each run</span>
          <span>Text extraction is deterministic · prompts affect images only</span>
        </footer>
      </div>
    </main>
  );
}
