// Dmitry's ten sample questions (the user's sections 7–15, 2026-11-03), asked as real questions on production's key, as
// a check account (read-only, removed at the end), in the agent container:
//   AGENT_CODE=checkout scripts/check-accounts.sh run agent-ten-questions
// Each goes first through the question check (codes against their place names, dates resolved — lib/question-check.mjs),
// exactly as the chat route does: a question back means nothing was searched. Then the turn, with both providers.
// Prints the answers as written, for grading by hand. Nothing is tuned here.
import { askAll } from "./agent-web-prompts.mjs";
export const ROLES = ["user"];
const TEN = [
  "Do you need to submit API or flight to Hong Kong ZSPD same as for flight to Macao VHHH.",
  "Is there FBO or GAT at EGCC, VCBI, OERK for Business Aviation. If yes, provide address, details, price and photos.",
  "Direct flight possible? LTBS-LCLK, UDYZ-UBBB, UBBB-URML, DAAT-GAMB. If not, why?",
  "Any Fuel shortage issues for Fuel Stop at Myanmar, Thailand, Bangladesh, Vietnam, Cambodia.",
  "Are you allowed to overfly Kaliningrad FIR in neutral waters with EU registration aircraft?",
  "Business/Charter flight to LFPB on B735 with 64PAX requires France landing permit?",
  "Flight LTBS-LBBG-EDDS on PC24 with PAX load, requires Bulgarian Landing permit?",
  "Direct flights between Armenia and Turkey allowed?",
  "Sudan North/South airspace is now open? What kind of flights are allowed? Provide restrictions for overflight.",
  "Any restrictions for Marsell FIR LFMM for 08Oct2026?",
].map((q, i) => ({ k: String(i + 1), title: `Question ${i + 1}`, q, check: true }));
export async function check(ctx) { return askAll(TEN, ctx); }
