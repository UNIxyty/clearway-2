// make_passenger_manifest — the agent's thin caller of the Passenger Manifest generator (agent/lib/manifest).
//
// The model only chooses WHICH flight (an id it got from the picker or from search_manifest_flights). Leon is read
// by typed code with the flight's operator's credentials (the operator registry, ../leon-operators.mjs — nothing is
// asked of the user; being signed in with agent access is the only gate), and the page is drawn by typed code; no
// model output reaches the document. No confirmation step: generating a document changes nothing and is undone by
// deleting the file.
//
// What comes back (to the model, the chat and the audit log) carries no passenger field: counts, page count, and
// warnings that identify a passenger by row and page only. The names and documents exist only inside the PDF.
import { defineTool } from "./framework.mjs";
import { InvalidInput, NoPermission, NotFound, ServiceUnavailable } from "./errors.mjs";
import { generatePassengerManifest, generateBlankManifest, ManifestFlightError, OperatorUnavailable } from "../manifest/index.mjs";
import { searchFlightsAllOperators } from "../leon-operators.mjs";
import { saveManifest } from "../manifest/store.mjs";

const STEPS = ["Connecting to the operator's Leon", "Reading the flight from Leon", "Filling the form", "Laying out the pages", "Saving the file"];
const BLANK_STEPS = ["Laying out the blank form", "Saving the file"];

defineTool({
  name: "make_passenger_manifest",
  description:
    "Generate the Passenger Manifest PDF (Clearway's border-authority form) for ONE flight, filled from that flight's operator's Leon — or the blank hand-fill form with blank=true. " +
    "Pass flight_id exactly as \"<oprId>:<flightNid>\" (the key from the manifest picker or search_manifest_flights); never guess one. " +
    "Before calling, say in one short sentence which flight you are building it for. After it returns, name the flight and the number of passengers, say plainly when there are none, and leave the warnings to the card the chat shows above the file. " +
    "If it fails, say what the error message says and nothing more — do not guess at causes. " +
    "NEVER write a passenger's name, date of birth, document number or nationality in the chat or aloud — the result deliberately contains none.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => (input.blank ? "Internal · blank passenger manifest" : `Internal · passenger manifest · Leon ${input.flight_id ?? ""}`.trim()),
  timeoutMs: 90_000,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      flight_id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{1,40}:\\d{1,12}$", description: 'The flight: "<oprId>:<flightNid>", e.g. "klj:74375326".' },
      blank: { type: "boolean", description: "true = the empty form for filling by hand (no flight, no page number)." },
    },
  },
  output: {
    type: "object",
    required: ["file", "manifest"],
    properties: {
      file: { type: "object", properties: { id: { type: "string" }, filename: { type: "string" }, mime: { type: "string" }, bytes: { type: "integer" }, downloadPath: { type: "string" } } },
      manifest: { type: "object", description: "Counts, page count and warnings (by row number only). No passenger details." },
    },
  },
  async handler(input, { user, conversationId, progress = () => {}, signal = null }) {
    const blank = input.blank === true;
    if (!blank && !input.flight_id) throw InvalidInput("Pick a flight (flight_id) or ask for the blank form (blank: true).");
    const steps = blank ? BLANK_STEPS : STEPS;
    const filename = blank ? "PAX-Manifest_blank.pdf" : "passenger manifest";
    // The generator reports its own step labels; each maps to a slot in the building card's step list (the
    // "Laying out N pages" label carries the real page count, the masked-passport read sits under "Reading").
    const SLOT = blank ? [["Laying", 0], ["Saving", 1]] : [["Connecting", 0], ["Reading", 1], ["Asking", 1], ["Filling", 2], ["Laying", 3], ["Saving", 4]];
    const step = (label) => {
      if (signal?.aborted) throw InvalidInput("Cancelled — the manifest was not created.");
      const index = SLOT.find(([prefix]) => label.startsWith(prefix))?.[1] ?? 0;
      progress(label, { index, steps: steps.map((s, i) => (i === index ? label : s)), filename, format: "pdf" });
    };

    let made;
    try {
      if (blank) {
        step(BLANK_STEPS[0]);
        made = await generateBlankManifest();
      } else {
        made = await generatePassengerManifest({ flightId: input.flight_id, progress: step });
      }
    } catch (error) {
      if (error instanceof OperatorUnavailable) {
        throw ServiceUnavailable(`This operator's Leon is unavailable — ${error.operatorName} ${error.reason}. An admin can update its credentials on the Digital Wall console's Operators page; every other operator still works.`);
      }
      if (error instanceof ManifestFlightError) {
        if (error.code === "no-access") throw NoPermission(error.message);
        if (error.code === "bad-flight-id") throw InvalidInput(error.message);
        if (error.code === "cancelled") throw NotFound(error.message);
        throw ServiceUnavailable(error.message);
      }
      if (/Cancelled/.test(String(error?.message))) throw error;
      // A font problem (missing / not the pinned file) or a render failure: never render with a substitute.
      throw ServiceUnavailable(`The manifest could not be generated: ${String(error?.message ?? error).slice(0, 200)}`);
    }

    step(steps[steps.length - 1]);
    const file = await saveManifest({ pdf: made.pdf, filename: made.filename, title: made.title, user, conversationId });
    return {
      file: { id: file.id, filename: file.filename, mime: file.mime, bytes: file.bytes, downloadPath: file.downloadPath },
      manifest: { ...made.result, filename: made.filename },
    };
  },
});

// The manifest picker's search: every configured operator's flights, read live from each operator's Leon (so a flight
// on an aircraft hidden from the wall is still found), each operator isolated — one failing key is reported as
// unavailable and the rest still answer. Flight rows only (callsign, registration, route, time, operator): no
// passenger data is read here.
defineTool({
  name: "search_manifest_flights",
  description:
    "List flights across EVERY configured operator for the passenger-manifest picker (callsign, registration, route, departure time, operator), read live from each operator's Leon. Also reports any operator whose Leon is unavailable. Use when the user wants a manifest and you need the flight's key.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: () => "Internal · Leon flights, all operators",
  timeoutMs: 40_000,
  maxResultBytes: 4 * 1024 * 1024,
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      from: { type: "string", description: "ISO timestamp, window start (default: 7 days ago)." },
      to: { type: "string", description: "ISO timestamp, window end (default: 30 days ahead)." },
    },
  },
  output: { type: "object", required: ["flights", "operators"], properties: { flights: { type: "array" }, operators: { type: "array" } } },
  async handler(input) {
    const now = Date.now();
    const fromMs = Date.parse(input.from ?? "") || now - 7 * 86_400_000;
    const toMs = Date.parse(input.to ?? "") || now + 30 * 86_400_000;
    if (toMs - fromMs > 62 * 86_400_000) throw InvalidInput("Search at most 62 days at a time.");
    try {
      return await searchFlightsAllOperators({ fromMs, toMs });
    } catch (error) {
      throw ServiceUnavailable(String(error?.message ?? error).slice(0, 200));
    }
  },
});
