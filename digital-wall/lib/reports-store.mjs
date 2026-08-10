// Console REPORTS (bug report item 13): an internal issue/request tracker.
// Ops raise a report (IT, Office, …), it moves through a fixed status
// lifecycle, and it can be emailed to a preset or arbitrary recipient.
// Local-JSON store, same pattern as important-store / caa-store.
//
// File shape:
//   { reports: [...], categories: [...], presets: [{label, email}] }
// Categories are an editable list (a new category typed in the form is
// added automatically); presets map a short label ("IT") to an address so
// nobody types emails day-to-day.

import { JsonFileStore } from "./json-store.mjs";

export const REPORT_STATUSES = ["untouched", "under_process", "done", "impossible"];
export const REPORT_STATUS_LABELS = {
  untouched: "Untouched",
  under_process: "Under process",
  done: "Done",
  impossible: "Impossible",
};
const DEFAULT_CATEGORIES = ["IT", "Office", "Ops", "Other"];

const text = (v) => String(v ?? "").trim();

export function sanitizeReport(input = {}, existing = null, actor = null) {
  const title = text(input.title ?? existing?.title);
  if (!title) throw new Error("Report title is required.");
  const now = new Date().toISOString();
  const status = REPORT_STATUSES.includes(String(input.status ?? existing?.status ?? "untouched"))
    ? String(input.status ?? existing?.status ?? "untouched")
    : "untouched";
  return {
    id: String(input.id || existing?.id || `REP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`),
    category: text(input.category ?? existing?.category) || "Other",
    title,
    body: String(input.body ?? existing?.body ?? "").trim(),
    status,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? actor,
    updatedAt: now,
    updatedBy: actor ?? existing?.updatedBy ?? null,
    // Every completed email send: { to: [..], at, by, resendId }.
    sends: Array.isArray(existing?.sends) ? existing.sends : [],
  };
}

export class ReportsStore {
  constructor() {
    this.store = new JsonFileStore("reports.json", { reports: [], categories: DEFAULT_CATEGORIES, presets: [] });
    this.reports = [];
    this.categories = [...DEFAULT_CATEGORIES];
    this.presets = [];
    this.loaded = false;
  }

  async load() {
    const payload = await this.store.read();
    this.reports = Array.isArray(payload.reports) ? payload.reports : [];
    this.categories = Array.isArray(payload.categories) && payload.categories.length > 0
      ? payload.categories.map(text).filter(Boolean)
      : [...DEFAULT_CATEGORIES];
    this.presets = Array.isArray(payload.presets)
      ? payload.presets.filter((p) => text(p?.label) && text(p?.email)).map((p) => ({ label: text(p.label), email: text(p.email) }))
      : [];
    this.loaded = true;
  }

  async persist() {
    await this.store.write({
      reports: this.reports,
      categories: this.categories,
      presets: this.presets,
      updatedAt: new Date().toISOString(),
    });
  }

  list({ status = "", category = "", q = "" } = {}) {
    const query = text(q).toLowerCase();
    return this.reports
      .filter((r) => (status ? r.status === status : true))
      .filter((r) => (category ? r.category === category : true))
      .filter((r) =>
        query
          ? `${r.title} ${r.body} ${r.category} ${r.createdBy ?? ""}`.toLowerCase().includes(query)
          : true
      )
      // Open items first (untouched, under_process), then newest first —
      // the day-to-day view is "what still needs doing".
      .sort((a, b) => {
        const openA = a.status === "done" || a.status === "impossible" ? 1 : 0;
        const openB = b.status === "done" || b.status === "impossible" ? 1 : 0;
        if (openA !== openB) return openA - openB;
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
  }

  async upsert(input, actor = null) {
    const existing = input.id ? this.reports.find((r) => r.id === input.id) : null;
    const next = sanitizeReport(input, existing, actor);
    const index = this.reports.findIndex((r) => r.id === next.id);
    if (index >= 0) this.reports[index] = next;
    else this.reports.push(next);
    // New categories typed in the form extend the list automatically.
    if (next.category && !this.categories.includes(next.category)) this.categories.push(next.category);
    await this.persist();
    return next;
  }

  async patch(id, patchInput = {}, actor = null) {
    const existing = this.reports.find((r) => r.id === id);
    if (!existing) throw new Error("Report not found.");
    return this.upsert({ ...existing, ...patchInput, id }, actor);
  }

  async remove(id) {
    const index = this.reports.findIndex((r) => r.id === id);
    if (index < 0) throw new Error("Report not found.");
    this.reports.splice(index, 1);
    await this.persist();
  }

  async recordSend(id, { to, by, resendId }) {
    const report = this.reports.find((r) => r.id === id);
    if (!report) throw new Error("Report not found.");
    report.sends = Array.isArray(report.sends) ? report.sends : [];
    report.sends.push({ to, at: new Date().toISOString(), by: by ?? null, resendId: resendId ?? null });
    report.updatedAt = new Date().toISOString();
    report.updatedBy = by ?? report.updatedBy ?? null;
    await this.persist();
    return report;
  }

  async saveConfig({ categories, presets }) {
    if (Array.isArray(categories)) {
      const cleaned = categories.map(text).filter(Boolean);
      if (cleaned.length > 0) this.categories = [...new Set(cleaned)];
    }
    if (Array.isArray(presets)) {
      this.presets = presets
        .filter((p) => text(p?.label) && /.+@.+\..+/.test(text(p?.email)))
        .map((p) => ({ label: text(p.label), email: text(p.email) }));
    }
    await this.persist();
    return { categories: this.categories, presets: this.presets };
  }
}
