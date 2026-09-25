// Document viewer types (spec addendum agent-design-spec-viewer.md).

import type { TableData } from "../types";

export type DocSource = "knowledge" | "generated" | "attachment" | "aip" | "table";
export type DocTier = "internal" | "company" | "attachment";
export type FileKind = "pdf" | "image" | "table" | "text" | "docx" | "unsupported";

export type DocApproval =
  | { status: "authoritative"; by?: string | null; at?: string | null }
  | { status: "reference" }
  | { status: "awaiting"; uploadedBy?: string | null; at?: string | null; approver?: string | null }
  | { status: "rejected" };

export type DocRef = {
  key: string;
  source: DocSource;
  id: string;
  filename: string;
  title?: string | null;
  mime: string | null;
  bytes: number | null;
  /** Same-origin URL the bytes come from (inline). Null for table tabs. */
  url: string | null;
  downloadUrl?: string | null;
  sourceUrl?: string | null;
  tier: DocTier;
  sourceName: string;
  fetchedAt?: string | null;
  uploadedBy?: string | null;
  /** Revision of this copy. Absent/null renders as "revision unknown" — never as current. */
  revision?: { label: string; state?: "current" | "future" | "superseded" | "unknown"; words?: string; reason?: string | null; superseded?: boolean; currentHref?: string | null; effectiveFrom?: string | null; validUntil?: string | null; fetchedAt?: string | null; revision?: string | null; previous?: { revision: string | null; effectiveDate: string | null; airac: string | null; fetchedAt: string | null }[] } | null;
  approval?: DocApproval | null;
  canApprove?: boolean;
  /** Agent table results open as a Table tab (§V8). */
  table?: TableData | null;
  /** Filled in as the file loads. */
  pages?: number | null;
};

/** What the viewer is asked to locate (§V6). */
export type Citation = {
  k: number;
  page: number | null;
  /** The exact retrieved text. Null when the source carried no passage. */
  span: string | null;
  /** Verbatim block check (§V6 "From a verbatim block"). */
  verbatim?: { text: string; recordId: string | null } | null;
  /** The revision the answer cited (§V6 revision mismatch). */
  revision?: { state: string; label: string; revision?: string | null } | null;
  conversationId?: string | null;
};

export type CitationResult = { k: number; state: "found" | "not-found" | "no-span" | "scanned"; page: number | null; parts?: number };

export type ViewerTab = {
  ref: DocRef;
  page: number;
  zoom: number | "fit";
  rotation: number;
  scrollTop: number;
  lastViewedAt: number;
  citations: Citation[];
  activeCitation: number | null;
  results: Record<number, CitationResult>;
};

export type OpenOptions = {
  page?: number | null;
  citation?: Citation | null;
  /** Breadcrumb label: what the viewer covers. */
  from?: string | null;
  /** Element to return focus to on close. */
  opener?: HTMLElement | null;
  /** Knowledge-base entry: the panel stays closed and the header offers "Ask about this document". */
  panelClosed?: boolean;
};

export function fileKindOf(ref: Pick<DocRef, "filename" | "mime" | "table">): FileKind {
  if (ref.table) return "table";
  const name = String(ref.filename ?? "").toLowerCase();
  const mime = String(ref.mime ?? "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (/^image\//.test(mime) || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return "image";
  if (/spreadsheet|excel|csv/.test(mime) || /\.(xlsx|xls|csv)$/.test(name)) return "table";
  if (/wordprocessingml|msword/.test(mime) || /\.docx?$/.test(name)) return "docx";
  if (/^text\/|json|xml/.test(mime) || /\.(txt|md|json|xml|log|notam|metar|csv)$/.test(name)) return "text";
  return "unsupported";
}

export function typeLabel(kind: FileKind, ref: Pick<DocRef, "filename">): string {
  const ext = String(ref.filename ?? "").split(".").pop()?.toUpperCase() ?? "";
  if (kind === "pdf") return "PDF";
  if (kind === "image") return ext || "IMAGE";
  if (kind === "table") return ext === "CSV" ? "CSV" : ext === "XLS" ? "XLS" : ext ? ext : "TABLE";
  if (kind === "docx") return "DOCX";
  if (kind === "text") return ext || "TXT";
  return ext || "FILE";
}

export const VIEWABLE = "PDF, PNG, JPG, CSV, XLSX, TXT, DOCX";
