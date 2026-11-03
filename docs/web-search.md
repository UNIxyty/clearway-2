# Web search, the source policy and citations (2026-11-03)

## What the agent does

- **Two providers.** The Anthropic API's own web search (`web_search`, a server tool) and Tavily (`tavily_search`). An
  admin chooses Tavily, Anthropic or **both** (the default) on Settings › Web search. Both stay; nothing was removed.
- **Two passes per question.**
  - **Pass one** searches only the approved sources.
  - **Pass two** comes only after the model calls `widen_web_search`, naming the part of the question pass one did not
    answer. From then on, in that turn, both providers search unrestricted.
  - `widen_web_search` is refused until an approved search has run in the turn.
- **Citations come from the API.**
  - The API's own search cites by URL (`web_search_result_location`).
  - Tavily's results and the knowledge base's passages go back to the model as `search_result` blocks, so the model cites
    them the same way (`search_result_location`).
  - `agent/lib/citations.mjs` turns those citations into numbered sources and claim spans. The console puts each source
    number after the claim it supports.
- **The mark goes on the claim.** A claim whose every source is outside the approved list carries "not from an official
  source: reuters.com, 2 Nov". An industry reference is approved and named, never marked. The model is told not to write
  the mark itself, but to say in the sentence who published the claim and when.
- **The source list.**
  - It lives in the `agent_settings` row `web:sources`, as `{ official, industry }`.
  - The first read seeds it from `agent/config/web-sources.json`. After that it is edited on the Settings page, without
    a deploy.
  - If the row cannot be read, the agent uses the file and says so. An empty list is refused, because the API treats
    "no list" as "the whole web".
- **Settings for every search:** `max_uses` 5. `user_location` is Riga **by city and time zone**: the API refuses
  country `LV` ("Country code LV is not supported", measured 3 Nov).
- **The daily ceiling.**
  - Every model call checks it, and so does every Tavily search.
  - An API search costs $0.01 and a Tavily search $0.008, on top of the tokens.
  - A turn that crosses the ceiling stops before its next call, and the person reads "stopped for today". It never
    answers unsearched (`rig/web-search-check.mjs` §4).

## Does a domain cover its subdomains? Yes, measured on the API, 3 Nov 2026

| `allowed_domains` | Hosts returned |
|---|---|
| `gov.uk` | www.gov.uk, www.legislation.gov.uk |
| `caa.co.uk` | www.caa.co.uk, publicapps.caa.co.uk |
| `ais.pansa.pl` | www.ais.pansa.pl (not pansa.pl) |
| `easa.europa.eu` | www.easa.europa.eu |

So a listed domain covers its subdomains. A listed subdomain does not cover its parent. `classifyUrl` follows the same
rule, so the mark and the filter always agree.

## The approved list (seed, 3 Nov)

- **Official:** section 5 of the brief, as given (44 domains).
- **Industry:** safeairspace.net, ops.group, universalweather.com, acukwik.com, acukwikalert.com, nbaa.org, ebaa.org.
- **States added beyond the brief:** none yet. Every addition is named here with its reason.

## Where it is checked

- **On the rig:** `rig/web-search-check.mjs`, 31 checks, through the chat route against stand-ins.
- **Scheduled smokes on production:**
  - `web-search` runs Tavily on pass one.
  - `web-search-api` runs the API's search on one allowed domain. It checks that no result is outside that domain and
    that a citation came back.
- **The eight test prompts on production's key:**
  `AGENT_CODE=checkout scripts/check-accounts.sh run agent-web-prompts`.

## What the API does that the docs did not say (measured on production's key, 3 Nov 2026)

1. **A tool result that holds `search_result` blocks may hold nothing else.** "If any blocks in a tool result are of
   type `search_result`, all blocks must be of that type." The tool's note and its pass therefore go beside the results,
   as text in the same user message. The first run of the eight prompts failed every Tavily turn on this.
2. **A search the model asks for can be left unanswered.** If it asks for searches in the same response as one of our
   tools (`widen_web_search`), those searches stay pending. The API runs them at the start of the next request, under
   that request's settings. So a widen in that response would have let pass-one searches run unrestricted (question 3
   of the ten). Pass two now begins only on a round with no search pending. Each search is labelled by the request it
   ran under, and a pass-one result outside the approved list is logged ("the filter was not applied").
3. **`user_location.country` "LV" is refused.** Riga goes by city and time zone.
4. **A 400 is a fault in our request.** It used to read as "the model is not available" (a Bedrock-era mapping) and
   set off a fallback to another model. It is now a refused call (`model_error`), never retried on another model.

## Browser check

`rig/web-citations-ui.mjs` needs a console build (`rig/build-portal.sh`), so it is not in `run-all-suites.sh`. It
checks desk and phone widths, light and dark: each claim's number, the mark on the one unapproved claim, the markdown
intact, the sources' classes, and Settings › Web search (18 checks, passing 3 Nov).
