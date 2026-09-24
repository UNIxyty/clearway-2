// Registering every tool is a side effect of importing this file. Anything that
// needs the registry imports THIS, never an individual tool module, so the set
// is the same everywhere — the model's tool list, the executor, and the audit.

import "./aip.mjs";
import "./flights.mjs";
import "./notam-weather.mjs";
import "./operational.mjs";
import "./fleet.mjs";
import "./monitoring.mjs";
import "./knowledge.mjs";
import "./files-email.mjs";

export { allTools, executeTool, getTool, toolSpecsFor, toolNamesFor, roleSatisfies, PERMISSIONS } from "./framework.mjs";
