// Console-initiated AIP/GEN send (Item 4): fetch the requested AD-2 and/or
// GEN 1.2 PDFs for a flight's departure/arrival airports through the
// portal's shared-cache routes, and EMAIL them to the signed-in user (never
// downloaded to the wall or the desktop). Progress is real — each stage is
// broadcast over SSE (aip-send.progress, keyed by job id) as the backend
// actually does the work, and GET /api/aip/send/:jobId serves the same
// state for polling fallback.

import crypto from "node:crypto";
import { fetchAipPdfBuffer, fetchGenPdfBuffer } from "./portal-client.mjs";
import { escapeHtml, sendEmail, mailerConfigured } from "./mailer.mjs";
import { buildEmail } from "../../shared/email/templates.mjs";
import { fmtZ } from "../../shared/email/layout.mjs";
import path from "node:path";
import { errorDetail, PublicError, REASONS, shownReason } from "./public-error.mjs";
import { dayLong, datedFilename, olderThanCycle, stampCachedCopy } from "./aip-stamp.mjs";

const MAX_KEPT_JOBS = 50;

export class AipSendService {
  constructor({ sseHub }) {
    this.sseHub = sseHub;
    this.jobs = new Map(); // jobId -> job state
  }

  getJob(jobId) {
    return this.jobs.get(jobId) ?? null;
  }

  publicJob(job) {
    return {
      jobId: job.jobId,
      flightNid: job.flightNid,
      flightNo: job.flightNo,
      stage: job.stage, // fetching | ready | emailing | sent | error
      to: job.to,
      // Both are our sentences already (portal-client / below); shownReason is the guard for anything else.
      docs: job.docs.map((d) => ({ label: d.label, status: d.status, source: d.source ?? null, error: shownReason(d.error ?? null, REASONS.docUnavailable()) })),
      error: shownReason(job.error ?? null, REASONS.docsSendFailed()),
      updatedAt: job.updatedAt,
    };
  }

  update(job, patch) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    this.sseHub?.broadcast({ type: "aip-send.progress", ...this.publicJob(job) });
  }

  /**
   * Start a send job. requests = [{icao, role: 'dep'|'arr', doc: 'aip'|'gen'}].
   * Returns the job id immediately; work runs async.
   */
  start({ flight, requests, user }) {
    const to = String(user?.email || "").trim();
    if (!to) throw new PublicError("Your account has no email address, so the documents cannot be sent. Report it from Help & support.");
    if (!mailerConfigured()) {
      console.error("[aip-send] refused: RESEND_API_KEY is not set, the server cannot send email");
      throw new PublicError("This wall cannot send email right now. Report it from Help & support.");
    }
    if (requests.length === 0) throw new PublicError("Pick at least one airport and document type.");

    const job = {
      jobId: crypto.randomUUID(),
      flightNid: String(flight.flightNid),
      flightNo: flight.flightNo,
      route: `${flight.adep?.icao ?? "UNK"} → ${flight.ades?.icao ?? "UNK"}`,
      to,
      stage: "fetching",
      docs: requests.map((r) => ({
        ...r,
        label: `${r.doc === "gen" ? "GEN 1.2" : "AIP AD-2"} · ${r.icao} (${r.role === "dep" ? "departure" : "arrival"})`,
        status: "pending", // pending | fetching | ready | unavailable
      })),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(job.jobId, job);
    if (this.jobs.size > MAX_KEPT_JOBS) {
      const oldest = this.jobs.keys().next().value;
      this.jobs.delete(oldest);
    }

    this.run(job).catch((error) => {
      console.error(`[aip-send] job ${job.jobId} failed: ${errorDetail(error)}`);
      this.update(job, { stage: "error", error: REASONS.docsSendFailed() });
    });
    return job.jobId;
  }

  async run(job) {
    // Stage 1: fetch every requested document (cache-first via the portal).
    this.update(job, { stage: "fetching" });
    const attachments = [];
    for (const doc of job.docs) {
      doc.status = "fetching";
      this.update(job, {});
      const result = doc.doc === "gen" ? await fetchGenPdfBuffer(doc.icao) : await fetchAipPdfBuffer(doc.icao);
      if (result.ok) {
        doc.status = "ready";
        doc.source = result.source;
        doc.fetchedAt = result.fetchedAt ?? null;
        doc.lastCheck = result.lastCheck ?? null;
        // The copy says on itself when it was fetched, and so does its file name (aip-stamp.mjs).
        const filename = datedFilename(result.filename, doc.fetchedAt);
        doc.filename = filename;
        // De-duplicate (dep+arr can share a GEN country file).
        if (!attachments.some((a) => a.filename === filename)) {
          attachments.push({ filename, content: await stampCachedCopy(result.buffer, doc.fetchedAt) });
        }
      } else {
        doc.status = "unavailable";
        doc.error = result.error;
      }
      this.update(job, {});
    }

    if (attachments.length === 0) {
      this.update(job, { stage: "error", error: REASONS.noDocuments() });
      return;
    }

    // Stage 2: documents obtained.
    this.update(job, { stage: "ready" });

    // Stage 3: build + send the email.
    this.update(job, { stage: "emailing" });
    // The generic notice of the one master layout (shared/email/templates.mjs, 2026-11-10): one line per document — a
    // cached copy with its fetch date (and a warning when older than a cycle), or the reason it is not attached.
    const lines = job.docs.map((d) => {
      const ready = d.status === "ready";
      const day = dayLong(d.fetchedAt);
      const old = olderThanCycle(d.fetchedAt);
      return ready ? `${d.label} — attached. ${day ? `Cached copy from ${day}` : "Cached copy, fetch date unknown"}${old ? ". More than one AIRAC cycle old: check the current AIP before use" : ""}.` : `${d.label} — not attached: ${d.error || "not available right now"}.`;
    });
    const subjectLine = `[DOCS] ${job.flightNo} ${job.route} — ${attachments.map((a) => a.filename).join(", ")}`;
    let html, text;
    try {
      const mail = buildEmail("19-notice", { portalUrl: String(process.env.PORTAL_BASE_URL || "https://clearway.verxyl.com").replace(/\/+$/, ""), supportEmail: "", subject: subjectLine, preheader: `${attachments.length} document${attachments.length === 1 ? "" : "s"} for ${job.flightNo} ${job.route}.`, eyebrow: "Flight documents", headline: `${job.flightNo} · ${job.route}`,
        body: `The AIP documents you asked for from the Digital Wall are attached. Each one says when its cached copy was fetched; check the current AIP before use.`, list: { title: `${job.docs.length} document${job.docs.length === 1 ? "" : "s"}`, lines }, details: [["Requested", fmtZ(Date.now()), { mono: true }]], reason: "you asked for these documents from the Digital Wall" });
      html = mail.html; text = mail.text;
    } catch (error) {
      // The email must never block document delivery.
      console.error("documents email could not be built, falling back to plain HTML:", error?.message || error);
      html = `<div style="font-family:system-ui,sans-serif;">Flight documents — ${escapeHtml(job.flightNo)} (${escapeHtml(job.route)}). See attachments.</div>`;
      text = `Flight documents — ${job.flightNo} (${job.route}). See attachments.`;
    }

    const result = await sendEmail({
      to: job.to,
      subject: subjectLine,
      html,
      text,
      attachments,
      record: { kind: "aip-send", by: job.to?.[0] ?? null, ref: job.flightNo ?? null }, // the live status row (mailbox › Sent)
    });

    if (result.ok) {
      this.update(job, { stage: "sent", emailId: result.recordId ?? null }); // "sent" = handed to the mail service; delivery is the row's later event
    } else {
      // sendEmail already logged the provider's answer; the person gets our sentence.
      console.error(`[aip-send] job ${job.jobId}: email not sent`);
      this.update(job, { stage: "error", error: REASONS.docsSendFailed() });
    }
  }
}
