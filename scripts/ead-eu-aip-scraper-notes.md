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
