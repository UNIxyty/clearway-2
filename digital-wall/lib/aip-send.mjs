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
      docs: job.docs.map((d) => ({ label: d.label, status: d.status, source: d.source ?? null, error: d.error ?? null })),
      error: job.error ?? null,
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
    if (!to) throw new Error("Signed-in user has no email address in the session.");
    if (!mailerConfigured()) throw new Error("Email is not configured on the server (RESEND_API_KEY).");
    if (requests.length === 0) throw new Error("Pick at least one airport and document type.");

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
      this.update(job, { stage: "error", error: error instanceof Error ? error.message : String(error) });
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
        // De-duplicate (dep+arr can share a GEN country file).
        if (!attachments.some((a) => a.filename === result.filename)) {
          attachments.push({ filename: result.filename, content: result.buffer });
        }
      } else {
        doc.status = "unavailable";
        doc.error = result.error;
      }
      this.update(job, {});
    }

    if (attachments.length === 0) {
      this.update(job, { stage: "error", error: "No document could be produced — see per-document reasons." });
      return;
    }

    // Stage 2: documents obtained.
    this.update(job, { stage: "ready" });

    // Stage 3: build + send the email.
    this.update(job, { stage: "emailing" });
    const docList = job.docs
      .map(
        (d) => `
      <li style="margin-bottom:6px;">
        <strong>${escapeHtml(d.label)}</strong> — ${d.status === "ready" ? `attached${d.source ? ` (source: ${escapeHtml(d.source)})` : ""}` : `<span style=\"color:#e5484d;\">unavailable: ${escapeHtml(d.error || "unknown")}</span>`}
      </li>`
      )
      .join("");
    const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px;">
      <h2 style="font-size:17px;">Flight documents — ${escapeHtml(job.flightNo)} (${escapeHtml(job.route)})</h2>
      <p style="font-size:13.5px;color:#3a3d44;">Requested from the Display Console. Documents come from the shared AIP cache (fetched fresh only when absent).</p>
      <ul style="font-size:13.5px;color:#3a3d44;padding-left:18px;">${docList}</ul>
      <p style="font-size:11.5px;color:#9aa0a8;">Generated ${escapeHtml(new Date().toISOString())} by the Clearway Digital Wall.</p>
    </div>`;

    const result = await sendEmail({
      to: job.to,
      subject: `[DOCS] ${job.flightNo} ${job.route} — ${attachments.map((a) => a.filename).join(", ")}`,
      html,
      attachments,
    });

    if (result.ok) {
      this.update(job, { stage: "sent" });
    } else {
      this.update(job, { stage: "error", error: `Email failed: ${result.error}` });
    }
  }
}
