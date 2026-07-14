import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Parser Audit Lab",
  description: "Audit PDF, DOCX, and PPTX extraction with the UBC GenAI Toolkit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
