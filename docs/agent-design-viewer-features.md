# Ops Agent document viewer: what it does

This is a plain-language guide to the features in `Ops Agent Document Viewer.dc.html`. It explains what each part does and why. For exact sizes, colours, copy and timings, see `agent-design-spec-viewer.md`.

---

## The idea in one line

When the agent gives you a document, you read it **next to the conversation**, so you can ask about it and check the agent's answers against it without leaving the console.

---

## 1. Where the document opens

The design compared three layouts, each at 1280 and 1920 wide:

- **O1: Document takes the page, chat stays as the panel (chosen).** The document replaces the console page you were on, between the sidebar and the agent panel. The panel doesn't move, so your conversation stays where it was.
- **O2: Split view.** The document and chat share the screen half and half. Rejected because at 1280 the page is too small to read.
- **O3: Full-screen sheet.** The document covers everything and the chat shrinks to a floating bar. Rejected because you can never see the answer and the source at the same time.

How O1 behaves:

- **The page underneath is kept.** Your place on the page (scroll, selection, filters) is still there when you close the document.
- **The sidebar is never touched.** It stays expanded, collapsed to the rail, or in a deep context, however you left it.
- **On smaller screens** (1280) the agent panel narrows to its minimum width while a document is open, and page thumbnails start hidden. That leaves room for a readable page.
- **On large monitors** the panel keeps its width, thumbnails show, and the page is capped at a comfortable reading width.
- **The same viewer** opens from the side panel and from the full-page chat.

---

## 2. Ways to open a document

A document can be opened from five places. Each uses the same word, **Open**, with an eye icon. You can also click the file name.

1. **A document the agent returned.** Open is now the main button, ahead of Download and Email.
2. **A file the agent generated**, such as a crew brief. Click Open or the page thumbnail.
3. **A file you attached.** Click the chip above your message. Files still uploading, failed, or too large can't be opened.
4. **A citation in an answer.** Click the small number after a claim. This is the most important one (see section 5).
5. **The Knowledge base.** An Open button appears when you hover over a row. From here the viewer opens with the agent panel closed, and an "Ask about this document" button lets you bring the agent in.

Citations to websites open the website in a new browser tab. The viewer is only for files.

---

## 3. The viewer, top to bottom

### Tabs
- Each open document gets a tab. You can have up to six. Opening a seventh closes the one you looked at least recently, with an Undo option.
- On the left, a "← Flights" link (or wherever you came from) closes the viewer and takes you back.
- Tabs belong to the conversation. Switch to another conversation and you get its documents. Come back and yours are restored, at the page and zoom you left.

### Header
- **File name** in the code font, so characters like 0/O and 1/l can't be misread.
- **Revision or validity**, such as "AIRAC 2610 · eff. 01 OCT 2026". It turns amber if the document has been superseded.
- **Type, size and page count.**
- **Where it came from:** Internal (for example the AIP Portal), Company (the Knowledge base), or Attachment (a file someone sent). Each has its usual colour.
- **When it was fetched or uploaded.**
- **Approval status**, for Knowledge base documents (see section 6).
- **Actions:**
  - **Attach to reply** adds the file, at the page you're on, to your next message.
  - **Email** sends it, always with a confirmation first.
  - **Download** gets the original file.
  - **Open source** goes to the original system (AIP Portal or Knowledge base).
  - **Close.**

### Toolbar
- **Thumbnails** on/off.
- **Page navigation:** previous, next, and a page box you can type a number into.
- **Zoom** in and out in steps (50% to 200%), plus **Fit width**.
- **Rotate** 90°.
- **Citation stepper**, when the conversation has cited this document: "Citation 2 of 3", with arrows to step between them.
- **Search**, on the right.

### Search
- Type to find text in the document. You see a match count ("1 of 5"), next and previous buttons, and which pages have matches.
- Matches are **yellow**; the current match is darker yellow. Thumbnails of pages with matches get a small amber dot.
- Search results are deliberately a different colour from the agent's citations (blue), so your own search is never mistaken for something the agent cited.
- Search isn't available on scanned documents, and the button says why.

### Thumbnails
- A column of small page previews. The current page is outlined in blue.
- Pages the agent cited carry a blue badge with the citation numbers.
- Click any thumbnail to jump to that page.

### The page area
- The page area and the thumbnail column each scroll on their own; the tabs, header and toolbar stay fixed.
- Text can be selected and copied, but not edited.

---

## 4. Reading and scrolling alongside the chat

- The document and the conversation scroll **separately**. Scrolling goes to whatever is under your mouse.
- **Clicking a citation moves the document, never the conversation.** New text arriving in the chat never moves the document either.
- The page you're reading is tracked, and shown in the page box, the thumbnails and the agent's context chip.
- **F6** moves keyboard focus between the document and the chat.

---

## 5. Checking the agent's claims (citation → document)

Click a citation number and the document opens **at the cited page with the passage highlighted**. It's a one-click way to check what the agent said against the source.

- **Found:** the passage is tinted blue with a numbered marker in the margin, and the marker pulses once as you arrive. In the answer, the matching claim and its source line light up too.
- **Passage runs over a page break:** both parts are tinted, with "continues on p. 13" and "continued from p. 12" tags linking them.
- **A second citation into the same document:** the viewer moves to the new passage without reloading. The earlier one stays visible as a dashed outline, so you can see both.
- **Passage can't be found:** there is **no highlight anywhere**, so it can't be mistaken for a match. A red banner quotes the claim and says to treat it as unverified. The page still opens where the agent said, so you can look yourself. In the answer, the citation number turns red with a "?". The failure is also recorded in the Activity log.
- **Only exact matches are highlighted.** A near-match is never shown as if it were the source.
- **Different revision:** if the agent cited an older revision, the viewer opens that one when it's available. Otherwise it shows the current one with a "superseded" warning.
- **Checking a quoted limitation:** opening the source from a word-for-word quote highlights the clause and confirms "text matches". If the file differs from the quote, you get a red warning instead, and the mismatch is logged as a data error.

---

## 6. Showing whether a document is approved

In the conversation, a black frame is reserved for text quoted word for word from approved documents. **The viewer never uses that black frame**, so it keeps its meaning. Instead, the header shows the status in words:

- **Authoritative:** a violet badge reading "Authoritative · approved by [name] [date]". Clauses the agent quoted get a small violet quote marker in the margin.
- **Reference:** a plain grey badge reading "Reference · cited, not quotable".
- **Awaiting approval:** an amber badge, plus a strip explaining that the agent won't quote or rely on the document until it's approved. Approvers also see a "Review in Knowledge base" button.

AIP documents don't carry an approval badge. Their revision date says whether they're current.

---

## 7. File types

Each type has its own view:

- **PDF:** the main case, with pages, search, citations and thumbnails.
- **Scanned PDF:** pages shown as images, with a notice that there's no text layer, so no search and no citation highlights.
- **Image** (screenshots, photos, charts): zoom up to 400% and drag to move around, with a small overview map when zoomed in.
- **Spreadsheet** (CSV, XLSX): a full table with the header row fixed at the top, row numbers, and tabs for each sheet.
- **Plain text and raw data** (NOTAMs, METAR): shown exactly as received in the code font, with line numbers, never re-wrapped.
- **Word documents:** shown as pages, with a note that the layout may differ from Word. Download gives you the original.
- **Files that can't be previewed** (for example .kmz): a card explaining what the file is, with Download, Email and Open in AIP Portal.

A table the agent produces in an answer also opens here, in its own tab, when you choose "Full view".

---

## 8. When something isn't normal

The file name, type and size are always shown, so you know what you opened, whatever state it's in.

- **Loading:** a placeholder page while the file opens.
- **Slow load** (a large AIP file): pages appear as they arrive, **starting with the page you need**, and a progress line shows how far along it is. You can read and search the pages already loaded while you wait.
- **Empty file:** says so, and offers to remove it from the conversation.
- **Couldn't display:** explains that the file may be damaged, with Retry, Download and Open in AIP Portal.
- **Too large** (over 100 MB): sends you to the AIP Portal, which handles big files, or lets you download it.
- **Password-protected:** asks for the password. It isn't stored, and the agent can't read protected files.
- **Couldn't fetch:** offers Retry, or the cached copy.
- **No permission:** explains who can grant access, and lets you request it.
- **Superseded:** the document is still shown, with an amber warning and a link to the current version.
- **Offline:** shows the copy saved on your PC, if there is one. Search still works; Download, Email and Open source wait for the connection.

---

## 9. Working with the agent while a document is open

- **The agent knows what you're reading.** The context chip changes to "Asking about [file] · p. 12" and follows you as you scroll. Ask "is this the current revision?" and the agent knows which document you mean. Clear the chip to ask something general.
- **An answer that cites another document** opens it in a new tab. The document you were reading is never replaced.
- **Minimising the agent panel** gives its space to the document. The agent keeps tracking your page, and ⌘J brings the panel back.
- **From the full-page chat:** the conversation narrows to a column on the right. Close the document and it returns to full width, where you were.
- **Very large files and AIP amendment bundles** go to the AIP Portal's own viewer, at the same page. This viewer doesn't replace the portal.

---

## 10. Keyboard shortcuts

| Key | What it does |
|---|---|
| Enter | Open the focused document, attachment or citation |
| Esc | Close search, then close the viewer |
| ⌘W | Close the current tab |
| Ctrl+Tab / Ctrl+⇧Tab | Next / previous tab |
| PgDn / PgUp | Next / previous page |
| Home / End | First / last page |
| ⌘+ / ⌘− | Zoom in / out |
| ⌘0 | Fit width |
| R | Rotate |
| T | Show or hide thumbnails |
| ⌘F | Search in the document |
| Enter / ⇧Enter | Next / previous search match |
| [ / ] | Previous / next citation in this document |
| ⌘S | Download |
| F6 | Move between the document and the chat |
| ⌘J | Show or hide the agent panel (the document stays open) |

When the viewer opens, keyboard focus goes to the page, so the page keys work straight away. When opened from a citation, focus goes to the highlighted passage and it's announced to screen readers. When the viewer closes, focus returns to whatever opened it.

---

## 11. Motion

- The viewer slides in gently over the page and slides out when closed.
- Citation jumps scroll smoothly to the passage; the highlight fades in and the marker pulses once.
- Page moves, zoom, rotate, opening search and toggling thumbnails are all short and quick.
- **With reduced motion turned on**, everything happens instantly, with no sliding, fading or pulsing.

---

## 12. Not included

- Tablet and phone layouts.
- The wall display.
- Editing, annotating, commenting or printing.
- Two documents side by side in one view (use tabs).
- Sorting or filtering spreadsheets.

---

## In the design file but not part of the product

The state switcher above the main frame, the option labels (O1, C2…), the "Recommended" badge, the scaled-down option frames and the grey notes are there for reviewing the design. They should not be built.
