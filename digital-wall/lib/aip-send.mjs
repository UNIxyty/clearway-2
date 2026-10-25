// Console-initiated AIP/GEN send (Item 4): fetch the requested AD-2 and/or
// GEN 1.2 PDFs for a flight's departure/arrival airports through the
// portal's shared-cache routes, and EMAIL them to the signed-in user (never
// downloaded to the wall or the desktop). Progress is real — each stage is
// broadcast over SSE (aip-send.progress, keyed by job id) as the backend
// actually does the work, and GET /api/aip/send/:jobId serves the same
// state for polling fallback.

import crypto from "node:crypto";
import { fetchAipPdfBuffer, fetchGenPdfBuffer } from "./portal-client.mjs";
import { escapeHtml, renderTemplateFile, sendEmail, mailerConfigured } from "./mailer.mjs";
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
    // Branded template (Email Templates.dc.html "B · Documents"): one row per
    // requested document — green check + PDF meta when attached, red cross +
    // reason when not. Rows are pre-escaped here and injected raw.
    const docRows = job.docs
      .map((d, index) => {
        const ready = d.status === "ready";
        const day = dayLong(d.fetchedAt);
        const old = olderThanCycle(d.fetchedAt);
        // Anything we email goes to someone who will act on it: each document says when its copy was fetched.
        const sub = ready
          ? `${day ? `Cached copy from ${escapeHtml(day)}` : "Cached copy, fetch date unknown"}${old ? " — more than one AIRAC cycle old. Check the current AIP before use." : ". Not refreshed automatically."}${d.source ? ` · source: ${escapeHtml(d.source)}` : ""}` + (d.lastCheck && d.lastCheck.ok === false ? ` The refresh on ${escapeHtml(dayLong(d.lastCheck.at) || "its last run")} failed; this is the last copy fetched.` : "")
          : escapeHtml(d.error || "This document is not available right now. Try again in a few minutes.");
        return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${index === 0 ? "0" : "12px 0 0 0"};"><tr>
                <td width="26" style="vertical-align:top;padding-top:1px;">
                  <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${ready ? "#e7f6ec" : "#fdecec"};color:${ready ? "#15803d" : "#e5484d"};font-size:12px;line-height:20px;text-align:center;font-weight:700;">${ready ? "&#10003;" : "&#10005;"}</span>
                </td>
                <td style="vertical-align:top;">
                  <div style="font-size:14px;font-weight:600;color:${ready ? "#17181c" : "#8a8f98"};line-height:1.35;">${escapeHtml(d.label)}</div>
                  <div style="font-size:12.5px;color:${ready ? (olderThanCycle(d.fetchedAt) ? "#9a3412" : "#6c7079") : "#b3383c"};${ready && olderThanCycle(d.fetchedAt) ? "font-weight:600;" : ""}margin-top:2px;line-height:1.4;">${sub}</div>
                </td>
                <td align="right" style="vertical-align:top;font-family:Consolas,Menlo,monospace;font-size:11.5px;font-weight:600;color:${ready ? "#15803d" : "#e5484d"};white-space:nowrap;padding-left:10px;">${ready ? "PDF" : "FAILED"}</td>
              </tr></table>`;
      })
      .join("");
    const requestedLine = `REQUESTED ${new Date()
      .toISOString()
      .slice(0, 16)
      .replace("T", " ")}Z`;
    const subjectLine = `[DOCS] ${job.flightNo} ${job.route} — ${attachments.map((a) => a.filename).join(", ")}`;
    let html;
    try {
      html = await renderTemplateFile(path.resolve(process.cwd(), "templates", "aip-documents.html"), {
        subject: subjectLine,
        flightNo: job.flightNo,
        route: job.route,
        requestedLine,
        docCount: String(job.docs.length),
        docRows,
      });
    } catch (error) {
      // Template missing/broken must never block document delivery.
      console.error("aip-documents template failed, falling back to plain HTML:", error?.message || error);
      html = `<div style="font-family:system-ui,sans-serif;">Flight documents — ${escapeHtml(job.flightNo)} (${escapeHtml(job.route)}). See attachments.</div>`;
    }

    const result = await sendEmail({
      to: job.to,
      subject: subjectLine,
      html,
      attachments,
    });

    if (result.ok) {
      this.update(job, { stage: "sent" });
    } else {
      // sendEmail already logged the provider's answer; the person gets our sentence.
      console.error(`[aip-send] job ${job.jobId}: email not sent`);
      this.update(job, { stage: "error", error: REASONS.docsSendFailed() });
    }
  }
}
