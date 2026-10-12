# How to write the docs

The docs site (`/docs`) is built from plain text files. You never touch the code: one file is one page, and adding
a page is adding a file. This is everything you need.

## Where things are

```
content/docs/site.json                       the name, logo, support link, and whether the docs are public
content/docs/04-digital-wall/                a section (the number puts it in order, the rest is its address)
content/docs/04-digital-wall/_section.md     the section's title, icon and one-line summary
content/docs/04-digital-wall/04-operators.md a page, shown at /docs/digital-wall/operators
public/docs-media/screenshots/               screenshots, by name
public/docs-media/videos/                    videos, by name
```

Names are lowercase with hyphens. The number at the front only sets the order (`01-`, `02-`, …), and you can leave
gaps (`10-`, `20-`) so a page can go in between later.

**A new section:** make a folder `NN-name`, and put `_section.md` in it:

```
---
title: Digital Wall
icon: monitor
summary: Today's flights for the ops room, phones and tablets.
---
```

The icon is the name of a file in `public/icons/` (without `.svg`).

**A new page:** make a file `NN-name.md` in the section's folder. It starts with a header between two `---` lines:

```
---
title: Operators
summary: One sentence under the title saying what this page is for.
status: draft
roles: Admin and Developer by default
video: operators | 30 seconds
updated: 2026-10-12
related: digital-wall/the-wall, admin/permissions
---
```

Only `title` is required. `video` names the page's video and roughly how long it will be. `related` lists other pages
as `section/page`, separated by commas.

## Marking a page written

Until the header says `status: written`, the page shows "This page is being written", with the list of tasks it will
cover (taken from its `##` headings) and a link to Help & support. So you can outline a page first, publish the
outline, and write it later. When the page is done, change `draft` to `written` and set `updated` to today's date.

## Tasks

A page is made of tasks: the things a person can do there. Each starts with `##`:

```
## Add an operator
Roles: Admin, Developer
Connects one Leon account to the wall, so its flights start to appear.

1. Open **Digital Wall** › **Operators**, and press **Add operator**.
   [screenshot: operators-add-button | Add operator, at the top right of the page.]
2. In **Operator name**, type the name people know the operator by.
   Note: You can leave it empty; the wall then uses the subdomain.
3. Press **Save operator**.
```

- The line right under the title can say who may do it (`Roles:`); without it the page's `roles` is used.
- The first sentence is the task's summary. Keep it to one.
- Steps are numbered `1.` `2.` `3.`. Lines indented under a step belong to it: a screenshot, or a `Note:`.
- On a long page, group tasks with a single `#` line (`# On a phone`). The page then opens with "What you can do
  here", listing every task.

Each task gets its own address (`…/operators#fn-add-an-operator`), made from its title. Changing a title changes the
address, so links to it must change too (the check below finds them).

## The blocks

| You write | You get |
|---|---|
| `**Save operator**` | A button or field name, in bold. Write it exactly as the screen does. |
| `` `exampleair` `` | A value someone types or reads, in a code style. |
| `[Operators](digital-wall/operators)` | A link to another page. Add `#add-an-operator` for one task. |
| `<!-- a note -->` | A note to other writers. Never shown. |

Blocks open with `:::` and a name, and close with a line holding only `:::`. Anything after the name is its title.

- `:::note Title` — something useful to know. Put it **after** the steps it is about.
- `:::warning Title` — something that can go wrong. Put it **before** the steps.
- `:::cannot-be-undone` — for anything that deletes or cannot be reversed. Put it **before** the steps and list
  exactly what is lost, one `- ` line each. The task is marked with a red sign in the page's task list.
- `:::example Title` — an example filled in. One `Name: value` per line. A value written as `` `value` `` gets a
  Copy button. **Invented names only** (`Example Air`, `exampleair`); never a real passenger, passport or person.
- `:::how-it-works` — the plain explanation of why, for readers who want it. After the steps.
- `:::statuses` — what each status means, with a coloured badge. One per line: `Synced (green): what it means`.
  Colours: green, blue, amber, red, grey.
- `:::whats-new 3.4 · 2026-10-02` — what changed in a version. Lines start with `New:`, `Changed:` or `Fixed:`.
- `:::history` — earlier versions, one per line: `3.3 · 2026-09-20: what changed`.

A **table** is lines between `|`, with a line of `---` under the headings:

```
| Field | What to enter | Example |
|---|---|---|
| ADEP / ADES | Four-letter ICAO code. | `EVRA` |
```

A **block of text to copy** (an email subject, a message format) goes between two lines of three backticks; its
title goes after the first ones. Lines starting with `#` explain the text: they are shown muted and are left out
when someone presses Copy.

````
```Scheduled email subject line
SCHED EXA123 EVRA-EGLF 14OCT 1420Z
# callsign  ADEP-ADES  date  off-block (UTC)
```
````

Every block, in both themes, is on the component sheet at `/developer/docs-components` (developers only).

## Screenshots and videos

Pages name their pictures; the files live apart. `[screenshot: operators-add-button | caption]` shows
`public/docs-media/screenshots/operators-add-button.png` (`.jpg` and `.webp` work too). If the file is not there,
the page shows "Screenshot to come" with the caption, never a broken image. So write the page first and add the
pictures later.

- Take screenshots at **double size** (a Retina screen, or the browser zoomed to 200%). They are shown at half
  their width, so a single button appears at its real size and a whole screen fills the column.
- **Only invented data in pictures.** Take them on the test copy of the portal, never on the real one.
- **Retaking means replacing files.** Save the new picture under the same name, and every page using it changes. No
  page is edited.
- Videos: `public/docs-media/videos/<name>.mp4`, with a still picture for before it plays as `<name>.jpg` next to it.
  The page's header line `video: operators | 30 seconds` names it. A video that is not there shows "Video to come".

## Checking your work

Ask a developer to run `node --no-warnings rig/docs-check.mjs` (it also runs with every test run). It says, in plain
words and with the file name, if a page has a line it doesn't understand, a link that goes nowhere, a missing section
title, or a picture file no page uses. Missing pictures are fine; it only counts them.

Your changes appear on the site with the next deploy of the portal.

## Public or not

The docs are behind the portal's sign-in. To open them to everyone, change `"public": false` to `"public": true` in
`content/docs/site.json`, and deploy. That is the only change. The same file holds the product name, the logo, the
address of the portal, the support link (`supportEmail` empty means the portal's Help & support page) and the credit
in the footer.
