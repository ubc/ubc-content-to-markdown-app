export type DocumentKind = "pdf" | "docx" | "pptx";

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
};

export const DEFAULT_SECURITY_PROMPT = `Describe only what is genuinely visible in the image.

If the image is purely decorative or non-instructional—for example an icon, clip-art, logo, doodle, background, divider, emoji, or generic stock photo—or is too unclear to describe, respond with exactly NO_CONTENT and nothing else.

Otherwise, describe it factually and concisely. For scientific figures, diagrams, structures, micrographs, gels, blots, and plots, report the visible structure, shapes, colours, panels, axes, and trends. If text is visible, transcribe it. Never invent identities, names, labels, values, or topics that are not visibly present. Do not add a preamble or commentary.`;

export const DEFAULT_PROMPTS: Record<DocumentKind, string> = {
  pdf: `You are extracting an embedded image from a PDF so it can be audited as searchable course notes. Preserve the meaning of the image at its position on the page.`,
  docx: `You are extracting an embedded image from a Word document so it can be audited as searchable course notes. Write a description that reads naturally beside the surrounding document text.`,
  pptx: `You are extracting an image from a presentation slide so it can be audited as searchable course notes. Focus on information a student would lose if only the slide text were retained.`,
};

export function extensionToDocumentKind(fileName: string): DocumentKind | null {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension === "pdf" || extension === "docx" || extension === "pptx"
    ? extension
    : null;
}
