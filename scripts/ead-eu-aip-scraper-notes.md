# EAD Basic – EU AIP scraper notes

Notes for automating login and navigation on EUROCONTROL EAD Basic (EU AIP data).

## Login

- **URL:** https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/login/ead-basic/
- **Credentials:** Store in env (e.g. `EAD_USER`, `EAD_PASSWORD`); do not commit.
- **Flow:**
  1. Navigate to login URL.
  2. Fill **User Name** and **Password**.
  3. **Submit:** The login control is an `<input type="submit">`, not a `<button>`. Options:
     - Submit the form programmatically (e.g. `form.submit()` or click the submit input).
     - Or send Enter from the password field.
     - In some automation setups you may need to click the Login control by selector (see below).
- **Post-login URL:** `https://www.ead.eurocontrol.int/fwf-eadbasic/public/cms/cmscontent.faces?configKey=default.home.page`

## Consent (Terms) dialog

After login, a terms/consent dialog appears. The scraper **must** click the accept button before using the app.

- **Button:** “Accept Terms and Conditions”
- **Selector (preferred):** `#acceptTCButton`
- **DOM path:** `div#termsDialog > div.ui-dialog-footer.ui-widget-content > span > button#acceptTCButton > span.ui-button-text.ui-c`
- **Accessible name:** “Accept Terms and Conditions”

In Playwright/Puppeteer:

- `page.click('#acceptTCButton')`  
- Or: `page.getByRole('button', { name: 'Accept Terms and Conditions' }).click()`

Wait for the dialog to be visible before clicking (e.g. wait for `#termsDialog` or the button).

## After consent – open AIP Library

After accepting terms, click the **AIP Library** item in the top nav to reach the AIP overview.

- **Link text:** “AIP Library”
- **Target URL:** `/fwf-eadbasic/restricted/user/aip/aip_overview.faces` (relative to EAD base)
- **Selector (ID):** `a#topForm\\:topMenu\\:j_idt17\\:3\\:j_idt18\\:j_idt28\\:j_idt29`  
  (IDs contain colons; escape as `\\:` in CSS or use attribute selector below.)
- **Attribute selector (more stable):** `a[href*="aip_overview.faces"]` or `a[href$="/user/aip/aip_overview.faces"]`
- **DOM path:** `div#background2 > div#page > form#topForm > div#topArea > div#topNav > div.ui-menu... > ul... > li.menu-level0[1] > a#topForm:topMenu:j_idt17:3:j_idt18:j_idt28:j_idt29`
- **HTML:** `<a id="topForm:topMenu:j_idt17:3:j_idt18:j_idt28:j_idt29" href="/fwf-eadbasic/restricted/user/aip/aip_overview.faces" class="ui-link ui-widget ui-menuitem-link ui-corner-all">AIP Library</a>`

In Playwright/Puppeteer:

- `page.click('a[href*="aip_overview.faces"]')`
- Or: `page.getByRole('link', { name: 'AIP Library' }).click()`

Then wait for AIP overview to load (e.g. URL contains `aip_overview.faces`) before scraping country/section structure.

## AIP overview – find airport

On `aip_overview.faces` the search form uses **custom JSF/PrimeFaces dropdowns** (not native `<select>`). Selectors use JSF IDs; colons must be escaped in CSS (e.g. `#mainForm\\:selectAuthorityCode_label`).

### 1) Authority (country) dropdown – select country by ICAO prefix

- **Purpose:** Choose the state/authority (e.g. Latvia = EV, so RIX = EVRA).
- **Label ID:** `mainForm:selectAuthorityCode_label`
- **DOM path:** `div#background2 > div#page > div#mainArea > div#mainCol > div#content > div#j_idt82 > div#j_idt82_content > form#mainForm > div#mainForm:j_idt89 > table#mainForm:searchTable > tbody > tr.ui-widget-content... > td.ui-panelgrid-cell[0] > div#mainForm:selectAuthorityCode > label#mainForm:selectAuthorityCode_label`
- **HTML:** `<label id="mainForm:selectAuthorityCode_label" class="ui-selectonemenu-label ...">Albania (LA)</label>`
- **Flow:** Click the label/dropdown to open, then select the option matching the country (e.g. "Latvia (EV)" for ICAO prefix EV).

### 2) Language dropdown – select English

- **Label ID:** `mainForm:selectLanguage_label`
- **DOM path:** `... table#mainForm:searchTable > tbody > tr... > td.ui-panelgrid-cell[2] > div#mainForm:selectLanguage > label#mainForm:selectLanguage_label`
- **HTML:** `<label id="mainForm:selectLanguage_label" ...>---</label>`
- **Flow:** Open dropdown, select **English**.

### 3) AIP Part dropdown – select AD

- **Label ID:** `mainForm:selectAipPart_label`
- **DOM path:** `... td.ui-panelgrid-cell[4] > div#mainForm:selectAipPart > label#mainForm:selectAipPart_label`
- **HTML:** `<label id="mainForm:selectAipPart_label" ...>---</label>`
- **Flow:** Open dropdown, select **AD**.

### 4) Open Advanced Search

- **Click target:** The **Advanced Search** gridcell in the table (same form, row below the dropdowns).
- **DOM path:** `... table#mainForm:searchTable > tbody > tr.ui-widget-content.ui-panelgrid-even[1] > td.ui-panelgrid-cell`
- **Ref (from snapshot):** gridcell with name "Advanced Search" (e.g. `e51`).

### 5) Airport ICAO code in Advanced Search

- **Input ID:** `mainForm:documentHeader`
- **DOM path:** `... div#mainForm:advancedSearchPanel > div#mainForm:advancedSearchPanel_content > table#mainForm:advancedSearch > tbody > tr.ui-widget-content[2] > td.ui-panelgrid-cell[1] > input#mainForm:documentHeader`
- **HTML:** `<input id="mainForm:documentHeader" name="mainForm:documentHeader" type="text" ...>`
- **Flow:** After opening Advanced Search, fill this input with the **airport ICAO code** (e.g. EVRA for Riga).

### Why the server can set country and AIP part but the internal browser cannot (same way)

The **server Playwright scripts** (e.g. `ead-download-aip-pdf.mjs`, `ead-list-icaos-by-country.mjs`) set **Authority** and **AIP Part** by:

1. **Authority:** Locating a **native `<select>`** with id `mainForm:selectAuthorityCode_input` (PrimeFaces often renders a hidden select for the form value) and calling `selectOption({ label: countryLabel })`.
2. **AIP Part:** Running **JavaScript in the page** (`page.evaluate()`): find the hidden `<select id="mainForm:selectAipPart_input">`, find the option with text `"AD"`, set `el.value = opt.value`, and `dispatchEvent(new Event('change', { bubbles: true }))`.

So the server never opens the visible custom dropdown; it manipulates the hidden select that backs the PrimeFaces component.

The **Cursor internal browser** (cursor-ide-browser MCP) has **no “run JavaScript in the page”** tool. It only has click, type, select_option, press_key, etc. The snapshot exposes the visible **combobox** (a div), not the hidden `<select>`. So here we can only try the **visible flow**: click the AIP Part combobox to open it, then click or keyboard to choose “AD”. In practice, the dropdown overlay often does not appear in the accessibility snapshot (it’s in a separate layer), and keyboard focus may not land on the list, so selecting “AD” reliably in the internal browser is not possible with the current MCP tools. **To set country and AIP part programmatically, use the existing Playwright scripts** (e.g. `ead-list-icaos-by-country.mjs` or `ead-download-aip-pdf.mjs`).

### Playwright example (conceptual)

```js
// 1) Authority – open and select e.g. Latvia (EV)
await page.click('#mainForm\\:selectAuthorityCode_label');
await page.click('text=Latvia (EV)');  // or more specific list item selector

// 2) Language – English
await page.click('#mainForm\\:selectLanguage_label');
await page.click('text=English');

// 3) AIP Part – AD
await page.click('#mainForm\\:selectAipPart_label');
await page.click('text=AD');

// 4) Advanced Search
await page.click('text=Advanced Search');  // or gridcell in search table

// 5) ICAO in document header
await page.fill('#mainForm\\:documentHeader', 'EVRA');
```

Note: JSF IDs with colons need escaping in CSS (`\\:`). Option lists are often in overlay panels; wait for panel visibility before clicking an option.

## Search results table – pick row and download PDF

After Search, results appear in a **DataTable**:

- **Table:** `form#mainForm > div#mainForm:searchResults > div.ui-datatable-tablewrapper > table`
- **tbody:** `tbody#mainForm:searchResults_data`
- **Columns (conceptually):** Effective Date | Document Name (PDF link) | eAIP/NON-AIRAC/AIRAC | Document Heading

### Which row to use (target AIP PDF)

You want the **eAIP AIRAC** row where **Document Heading** is exactly **"AD 2 " + ICAO** with no extra text.

- **Match:** Document Heading cell text equals `"AD 2 EVRA"` (i.e. `AD 2 <ICAO>` only). Example: gridcell with name `"AD 2 EVRA"`.
- **Ignore:** Rows where Document Heading contains more text (e.g. "AD 2 EVRA Aerodrome Chart - ICAO", "AD 2 EVRA Standard Arrival Chart..."). Those are specific charts, not the main AD 2 section.

So: find the row where the **Document Heading** column equals exactly `"AD 2 " + icao` (e.g. `"AD 2 EVRA"` for EVRA).

### PDF link in that row

- In that row, the **Document Name** cell contains an `<a class="wrap-data">` link; its `href` is a redirect URL, e.g.  
  `/fwf-eadbasic/aip/redirect?link=...&authorityCode=EV`
- **Link text** is the filename, e.g. `EV_AD_2_EVRA_en.pdf`.
- **Full URL:** prepend base `https://www.ead.eurocontrol.int`.

Clicking the link opens/downloads the PDF (often `target="_blank"`).

### Scraper logic (Playwright)

1. Wait for table: `page.locator('#mainForm\\:searchResults_data')` or `page.getByRole('grid')`.
2. Find the row where the Document Heading cell text is exactly `"AD 2 " + icao` (e.g. `"AD 2 EVRA"`).  
   - e.g. get all rows, then find the one whose heading cell matches `/^AD 2 EVRA$/`.
3. In that row, get the PDF link (first `<a>` in Document Name column, or link whose text ends with `_en.pdf` for the main AD 2).
4. **To save the PDF:** use Playwright’s download API so the file is captured instead of opening in a new tab:
   ```js
   const [download] = await Promise.all([
     page.waitForEvent('download'),
     page.click('row selector >> a.wrap-data')  // or the PDF link in the target row
   ]);
   await download.saveAs(path.join(outDir, download.suggestedFilename()));
   ```
   Or get `href`, then `page.goto(fullUrl)` and save response body / use `request.get` with the same cookies if needed.

### Extraction from PDFs

- **Regex:** `scripts/ead-extract-aip-from-pdf.mjs` — parses AD 2.1–2.6 from PDF text; layout varies by country (e.g. "ESGG 2.1" vs "AD 2.1").
- **AI:** `scripts/ead-extract-aip-from-pdf-ai.mjs` — uses OpenAI to extract the same schema from PDF text; set `OPENAI_API_KEY` in `.env`. Handles varying layouts and wording.
- **EC2:** Dedicated instance setup (clone, deps, EAD env, cron) is in `scripts/AIP-AWS-SETUP.md`.

### List all ICAOs per country

- **Script:** `scripts/ead-list-icaos-by-country.mjs` — logs in, opens AIP Library, then for each EAD country selects the authority, opens AD part, runs search (empty = all), paginates through results and extracts every AD 2 ICAO from the table. Output: `data/ead-all-icaos-by-country.json` (or `--output path`).
- **Run (with virtual display on Linux):** `xvfb-run -a node scripts/ead-list-icaos-by-country.mjs`
- Requires `EAD_USER` and `EAD_PASSWORD` (or `EAD_PASSWORD_ENC`) in `.env` or environment.
