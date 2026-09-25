// Read the revision sidecar of a cached AIP PDF and turn it into a Revision.
// The sidecar is written by the aip-sync worker (scripts/aip-sync-server.mjs)
// and by scripts/tools/backfill-aip-revisions.mjs; see lib/aip-revision-meta.mjs.

import { readJsonFromStorage } from "@/lib/aip-storage";
import { aipRevision, previousRevisions, type AipRevisionMeta, type Revision } from "@/lib/airac";

export function metaKeyFor(pdfKey: string): string {
  return pdfKey.replace(/\.pdf$/i, "") + ".meta.json";
}

export type AipRevisionInfo = Revision & {
  /** Earlier copies replaced under the same key (a citation may still name one). */
  previous: ReturnType<typeof previousRevisions>;
  source: string | null;
  sourceFilename: string | null;
  sha256: string | null;
};

/** Never throws: a missing or unreadable sidecar is an unknown revision, stated as such. */
export async function readAipRevision(pdfKey: string | null): Promise<AipRevisionInfo> {
  let meta: AipRevisionMeta | null = null;
  if (pdfKey) {
    try { meta = await readJsonFromStorage<AipRevisionMeta>(metaKeyFor(pdfKey)); } catch { meta = null; }
  }
  const rev = aipRevision(meta);
  return { ...rev, previous: previousRevisions(meta), source: meta?.source ?? null, sourceFilename: meta?.sourceFilename ?? null, sha256: meta?.sha256 ?? null };
}
