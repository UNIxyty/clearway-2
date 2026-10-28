import { notFound } from "next/navigation";

// Any /docs address deeper than section/page (/docs/a/b/c): the docs' own not-found, inside the docs layout. Without this
// it fell through to the portal's root not-found, which therefore had to carry a docs version — and the root not-found
// rides in the payload of every page, a pending client's waiting screen included (removed 2026-10-28).
export default function DocsDeeper() {
  notFound();
}
