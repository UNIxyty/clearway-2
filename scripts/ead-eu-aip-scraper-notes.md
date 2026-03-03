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

## After consent

- Home page shows: **AIP Library**, Pre-Flight Briefing, SDO Reporting, Prepare my Flight, User Profile, Help.
- **AIP Library** is the entry point for EU AIP data — navigate there next for country/section structure and download links.
