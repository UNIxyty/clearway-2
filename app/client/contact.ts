// The one way out of a client's holding pages (waiting, refused, removed): an address to write to, from the brand
// settings (content/docs/site.json › supportEmail). Empty until someone fills it in, and then nothing is shown — never
// the portal's Help & support page, which a client cannot open. Server only: the page passes the string down.
import site from "@/content/docs/site.json";

export function clientContactEmail(): string {
  const v = String((site as { supportEmail?: string }).supportEmail ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
}
