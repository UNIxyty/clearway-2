import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import "@/shared/docs-tokens.css";
import "@/app/docs/docs.css";
import "@/app/docs/blocks.css";
import "./sheet.css";
import PortalShell from "@/components/portal/Shell";
import { parsePage } from "@/lib/docs/parse";
import { Blocks, FunctionBlock } from "@/components/docs/Blocks";
import { Shot, Video } from "@/components/docs/Media";
import { CopyValue } from "@/components/docs/Copy";
import { Breadcrumb, PrevNextNav } from "@/components/docs/DocsFrame";
import { BeingWritten, RelatedCards } from "@/components/docs/PageView";

// The docs component sheet (design: Docs Components): every content block and every "not yet" state, rendered twice
// from the same markup, inside data-theme="light" and data-theme="dark". Developer only (app/developer/layout.tsx),
// off every nav, like /developer/components. The text is sheet.md, written in the same format as a docs page, so
// the sheet also proves the format. Everything in it is invented.
//
// The one stand-in picture (public/docs-media/sheet/stand-in.png, a capture of the rig with invented data), when present, is shown
// here so the frame can be judged. It is outside public/docs-media/screenshots/, so no docs page can reference it.

export const dynamic = "force-dynamic";

const SHEET_MEDIA = path.join(process.cwd(), "public", "docs-media", "sheet");
const standIn = fs.existsSync(path.join(SHEET_MEDIA, "stand-in.png")) ? "/docs-media/sheet/stand-in.png" : null;
const sheetShot = (name: string) => (name === "sheet-stand-in" ? standIn : null);

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="dx-sheet-section" aria-label={`${n} ${title}`}>
      <div className="dx-sheet-label">{n} · {title}</div>
      {children}
    </section>
  );
}

function Sheet({ theme }: { theme: "light" | "dark" }) {
  const page = parsePage(fs.readFileSync(path.join(process.cwd(), "app", "developer", "docs-components", "sheet.md"), "utf8"), "sheet.md");
  const fn = (title: string) => page.fns.find((f) => f.title === title)!;
  const body = (title: string) => <Blocks blocks={fn(title).blocks} fig={{ next: () => "", shot: sheetShot }} />;
  return (
    <div data-theme={theme} className="dx dx-sheet-theme" data-sheet-theme={theme}>
      <div className="dx-sheet-title"><span>Content blocks</span><span className="dx-mono">data-theme=&quot;{theme}&quot;</span></div>

      <Section n="2.1" title="Task with steps, screenshot, note, example">
        <FunctionBlock fn={fn("Add an operator")} shot={sheetShot} />
      </Section>

      <Section n="2.2" title="Screenshot: there, not taken yet, loading, didn’t load">
        <Shot src={standIn} caption="A whole screen. Fills the column; the stage keeps the same padding whatever the shape. (The one stand-in picture; this sheet only.)" fig="4.1" />
        <div className="dx-sheet-two">
          <Shot src={null} caption="The Add a site row, below the approved sites table." fig="" />
          <Shot src={standIn ?? "/"} caption="Loading" fig="" demo="loading" />
        </div>
        <Shot src={standIn ?? "/"} caption="" fig="" demo="failed" />
      </Section>

      <Section n="2.3" title="Video: poster, not made yet, loading, didn’t play">
        <Video src="/" poster={standIn} title="Operators in 30 seconds" length="0:29" demo="idle" />
        <Video src={null} poster={null} title="" length="30 seconds" />
        <div className="dx-sheet-two">
          <Video src="/" poster={null} title="" length="" demo="loading" />
          <Video src="/" poster={null} title="" length="" demo="failed" />
        </div>
      </Section>

      <Section n="2.4" title="Callouts: note, warning, cannot be undone">
        <Blocks blocks={fn("Add an operator").blocks.filter((b) => b.kind === "callout")} />
        <Blocks blocks={fn("Delete an operator").blocks.filter((b) => b.kind === "callout")} />
        <p className="dx-sheet-hint">Warnings and cannot-be-undone sit above the steps they apply to. Notes sit below.</p>
      </Section>

      <Section n="2.5" title="Codes and values">
        {body("Codes and values")}
        <div className="dx-sheet-row"><CopyValue value="exa-exa" /><span className="dx-sheet-hint">Copy on every value a person would paste (in an example).</span></div>
      </Section>

      <Section n="2.6" title="Table: field list and status meanings">
        {body("Tables")}
      </Section>

      <Section n="2.7" title="What’s new and version history">
        {body("What's new and version history")}
      </Section>

      <Section n="2.8" title="Breadcrumb, related, previous / next">
        <Breadcrumb crumbs={[{ title: "Docs", href: "#" }, { title: "Digital Wall", href: "#" }, { title: "Operators" }]} />
        <RelatedCards items={[{ where: "Digital Wall", title: "The wall", href: "#related-1" }, { where: "Section", title: "Admin", href: "#related-2" }]} />
        <PrevNextNav items={[{ kind: "prev", title: "The wall", sub: "Digital Wall", href: "#prev" }, { kind: "next", title: "Webhooks", sub: "Digital Wall", href: "#next" }]} />
      </Section>

      <Section n="2.9" title="Task that cannot be undone, no screenshots yet">
        <FunctionBlock fn={fn("Delete an operator")} shot={sheetShot} />
      </Section>

      <Section n="2.10" title="Not written yet: a page with its tasks listed, and one without">
        <BeingWritten tasks={["Add an operator", "Check that the wall is getting flights", "Pause or resume an operator"]} long={false} />
        <BeingWritten tasks={[]} long={false} />
      </Section>

      {page.problems.length > 0 && <pre className="dx-sheet-problems">{page.problems.join("\n")}</pre>}
    </div>
  );
}

export default function DocsComponentSheet() {
  return (
    <PortalShell title="Docs component sheet" subtitle="Every block a docs page can use, and every “not yet” state, in both themes. The text is invented; the one picture is a stand-in, shown here only.">
      <div className="dx-sheet-wrap">
        <Sheet theme="light" />
        <Sheet theme="dark" />
      </div>
    </PortalShell>
  );
}
