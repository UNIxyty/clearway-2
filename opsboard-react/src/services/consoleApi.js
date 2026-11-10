// Console-only API calls (2026-11-10): the AIP document send and the AIP PDF address. They lived in timelineApi.js,
// which every surface shares; a client's browser must download no AIP code, so they moved here, imported by the
// console's pages only (the ConsoleApp chunk). rig/bundle-sweep.mjs reads the client's downloads for 'api/aip'.
import { buildApiUrl, fetchJson } from './timelineApi';
import { failureFrom, readPayload } from './errorText';

export async function sendFlightDocs({ flightNid, oprId, airports, docs }) {
  const response = await fetch(buildApiUrl('/api/aip/send'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ flightNid, oprId, airports, docs }),
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.ok === false) {
    throw failureFrom(payload, "Couldn't start sending the documents.");
  }
  return payload;
}

export async function fetchAipSendJob(jobId) {
  return fetchJson(`/api/aip/send/${encodeURIComponent(jobId)}`, "Couldn't load the document send.");
}

export function aipPdfUrl(icao) {
  return buildApiUrl(`/api/aip-pdf?icao=${encodeURIComponent(String(icao || '').toUpperCase())}`);
}

