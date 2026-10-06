// make_passenger_manifest — the agent's thin caller of the Passenger Manifest generator (agent/lib/manifest).
//
// The model only chooses WHICH flight (an id it got from the picker or from search_flights). Leon is read by typed
// code, as the signed-in user, and the page is drawn by typed code; no model output reaches the document. No
// confirmation step: generating a document changes nothing and is undone by deleting the file.
//
// What comes back (to the model, the chat and the audit log) carries no passenger field: counts, page count, and
// warnings that identify a passenger by row and page only. The names and documents exist only inside the PDF.
import { defineTool } from "./framework.mjs";
import { InvalidInput, NoPermission, NotFound, ServiceUnavailable } from "./errors.mjs";
import { generatePassengerManifest, generateBlankManifest, ManifestFlightError, LeonAccessError } from "../manifest/index.mjs";
import { saveManifest } from "../manifest/store.mjs";

const STEPS = ["Checking your Leon access", "Reading the flight from Leon", "Filling the form", "Laying out the pages", "Saving the file"];
const BLANK_STEPS = ["Laying out the blank form", "Saving the file"];

defineTool({
  name: "make_passenger_manifest",
  description:
    "Generate the Passenger Manifest PDF (Clearway's border-authority form) for ONE flight, filled from Leon with the user's own Leon access — or the blank hand-fill form with blank=true. " +
    "Pass flight_id exactly as \"<oprId>:<flightNid>\" (the record key from the manifest picker or search_flights); never guess one. " +
    "Before calling, say in one short sentence which flight you are building it for. After it returns, name the flight and the number of passengers, say plainly when there are none, and leave the warnings to the card the chat shows above the file. " +
    "If it fails, say what the error message says and nothing more — do not guess at causes (e.g. a NO_PERMISSION means Leon would not show this flight to the user's own Leon account). " +
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
    const SLOT = blank ? [["Laying", 0], ["Saving", 1]] : [["Checking", 0], ["Reading", 1], ["Asking", 1], ["Filling", 2], ["Laying", 3], ["Saving", 4]];
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
        made = await generatePassengerManifest({ flightId: input.flight_id, user, progress: step });
      }
    } catch (error) {
      if (error instanceof LeonAccessError) {
        if (error.code === "not-linked") throw NoPermission(`${error.message} Link it in Settings → Leon access (your own Leon API refresh token); the manifest is only ever read with your own Leon account.`);
        if (error.code === "rejected") throw NoPermission(error.message);
        throw ServiceUnavailable(error.message);
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
