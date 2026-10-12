import type { DocPage, DocSection, Docs } from "@/lib/docs/content";
import { videoSrc } from "@/lib/docs/content";
import { fmtDate } from "@/lib/docs/view";
import { SITE } from "@/lib/docs/content";
import MaskIcon from "@/components/portal/Icon";
import { Blocks, FunctionBlock } from "./Blocks";
import { Video } from "./Media";

// A docs page (design: Page Docs Short / Page Docs Long). A long page (groups, or 8+ tasks) opens with "What you can do
// here", so someone landing on it sees every task on the first screen. A page not marked written shows what it will
// cover instead of empty headings.

function relatedCards(docs: Docs, page: DocPage) {
  return page.related.map((r) => {
    const [s, p] = r.split("/");
    const sec = docs.sections.find((x) => x.slug === s);
    const pg = sec?.pages.find((x) => x.slug === p);
    return sec && (pg || !p) ? { where: pg ? sec.title : "Section", title: pg ? pg.title : sec.title, href: pg ? pg.href : sec.href } : null;
  }).filter((x): x is { where: string; title: string; href: string } => !!x);
}

export default function PageView({ docs, section, page }: { docs: Docs; section: DocSection; page: DocPage }) {
  const written = page.status === "written";
  const long = page.groups.length > 0 || page.fns.length >= 8;
  const v = page.video ? videoSrc(page.video.name) : null;
  const rel = relatedCards(docs, page);
  const groups = page.groups.length ? page.groups : [""];
  return (
    <div className="dx-page">
      <header className="dx-page-head">
        <span className="dx-eyebrow">{section.title}</span>
        <h1 className="dx-h1">{page.title}</h1>
        {page.summary && <p className="dx-lede">{page.summary}</p>}
        <div className="dx-meta">
          {page.fns.length > 0 && <span><MaskIcon name="list-checks" size={14} />{page.fns.length} {page.fns.length === 1 ? "task" : "tasks"}</span>}
          {page.roles && <span><MaskIcon name="shield" size={14} />{page.roles}</span>}
          {page.updated && <span><MaskIcon name="calendar" size={14} />Updated {fmtDate(page.updated)}</span>}
          {long && section.version && <span><MaskIcon name="tag" size={14} />Version {section.version}</span>}
        </div>
      </header>

      {!written ? (
        <div className="dx-empty" data-docs-state="being-written">
          <div className="top"><MaskIcon name="pen-line" size={20} className="ic" />
            <div><span className="t">This page is being written</span>
              <span className="b">{page.fns.length ? "These are the tasks it will cover." : "What it will cover is still being decided."} Until then, ask in <a href={SITE.supportLink}>{SITE.supportLabel}</a>.</span></div>
          </div>
          {page.fns.length > 0 && <ol className={long ? "cols" : ""}>{page.fns.map((f) => <li key={f.id}>{f.title}</li>)}</ol>}
        </div>
      ) : (
        <>
          {page.video && <Video src={v?.src ?? null} poster={v?.poster ?? null} title={`${page.title} in ${page.video.length || "a minute"}`} length={page.video.length} />}
          {page.intro.length > 0 && <Blocks blocks={page.intro} />}
          {long && (
            <nav aria-label="Tasks on this page" className="dx-index">
              <div className="head"><span className="t">What you can do here</span><span className="s">Pick a task to jump to it</span></div>
              <div className="cols">
                {groups.map((g) => (
                  <div key={g} className="col">
                    {g && <span className="g">{g}</span>}
                    {page.fns.filter((f) => f.group === g).map((f) => (
                      <a key={f.id} href={`#fn-${f.id}`}><span className="num dx-mono">{String(f.n).padStart(2, "0")}</span><span>{f.title}</span>
                        {f.irreversible && <MaskIcon name="octagon-alert" size={13} className="dx-danger-ic" />}</a>
                    ))}
                  </div>
                ))}
              </div>
            </nav>
          )}
          {groups.map((g) => (
            <section key={g} className="dx-group" aria-label={g || undefined}>
              {g && <div className="dx-group-head"><span>{g}</span><span className="line" /></div>}
              {page.fns.filter((f) => f.group === g).map((f) => <FunctionBlock key={f.id} fn={f} />)}
            </section>
          ))}
          {rel.length > 0 && (
            <section className="dx-related">
              <h2>Related</h2>
              <div className="cards">{rel.map((r) => <a key={r.href} href={r.href}><span className="w">{r.where}</span><span className="t">{r.title}</span></a>)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
