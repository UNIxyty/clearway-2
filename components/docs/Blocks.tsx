import type { Block, Fn, Inline } from "@/lib/docs/parse";
import { screenshotSrc, videoSrc } from "@/lib/docs/content";
import MaskIcon from "@/components/portal/Icon";
import { InlineText } from "./Inline";
import { Shot, Video } from "./Media";
import { CopyTaskLink, CopyValue } from "./Copy";

// The content blocks (design: Docs Components / Docs Function). Server components: they know which screenshot and
// video files exist, so a missing one is drawn as "to come" without the browser ever asking for it.

type Fig = { next: () => string };

function Callout({ tone, title, body, fig }: { tone: "note" | "warning" | "irreversible"; title: string; body: Block[]; fig: Fig }) {
  if (tone === "irreversible") {
    return (
      <div className="dx-irrev" role="note" aria-label={title}>
        <div className="band"><MaskIcon name="octagon-alert" size={18} />{title}</div>
        <div className="body"><Blocks blocks={body} fig={fig} /></div>
      </div>
    );
  }
  return (
    <div className={`dx-callout ${tone}`} role="note">
      <MaskIcon name={tone === "warning" ? "triangle-alert" : "info"} size={18} className="ic" />
      <div className="txt"><span className="t">{title}</span><div className="b"><Blocks blocks={body} fig={fig} /></div></div>
    </div>
  );
}

export function Blocks({ blocks, fig }: { blocks: Block[]; fig?: Fig }) {
  const f: Fig = fig ?? { next: () => "" };
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "p": return <p key={i} className="dx-p"><InlineText text={b.text} /></p>;
          case "h3": return <h3 key={i} className="dx-h3"><InlineText text={b.text} /></h3>;
          case "list": return <ul key={i} className="dx-ul">{b.items.map((it, k) => <li key={k}><InlineText text={it} /></li>)}</ul>;
          case "steps": return (
            <ol key={i} className="dx-steps">
              {b.steps.map((s, k) => (
                <li key={k} className={k === b.steps.length - 1 ? "last" : ""}>
                  <div className="rail"><span className="num dx-mono">{k + 1}</span>{k < b.steps.length - 1 && <span className="line" />}</div>
                  <div className="body">
                    <p className="dx-step-text"><InlineText text={s.text} /></p>
                    {s.shot && <Shot src={screenshotSrc(s.shot.name)} caption={s.shot.caption} fig={f.next()} />}
                    {s.note && <div className="dx-step-note"><MaskIcon name="info" size={14} /><span><InlineText text={s.note} /></span></div>}
                  </div>
                </li>
              ))}
            </ol>
          );
          case "callout": return <Callout key={i} tone={b.tone} title={b.title} body={b.body} fig={f} />;
          case "example": return (
            <div key={i} className="dx-example">
              <div className="head"><MaskIcon name="flask-conical" size={14} className="ic" /><span className="lab">Example</span>{b.title && <span className="t">{b.title}</span>}</div>
              <dl>{b.rows.map((r, k) => (
                <div key={k} className="row"><dt>{r.key}</dt><dd>{r.copy ? <CopyValue value={r.copy} /> : <InlineText text={r.value} />}</dd></div>
              ))}</dl>
            </div>
          );
          case "how": return (
            <div key={i} className="dx-how"><span className="lab">How it works</span><Blocks blocks={b.body} fig={f} /></div>
          );
          case "shot": return <Shot key={i} src={screenshotSrc(b.shot.name)} caption={b.shot.caption} fig={f.next()} />;
          case "video": { const v = videoSrc(b.name); return <Video key={i} src={v?.src ?? null} poster={v?.poster ?? null} title="Watch" length={b.length} />; }
          case "code": return (
            <div key={i} className="dx-codeblock">
              {b.title && <div className="bar"><span>{b.title}</span></div>}
              <pre className="dx-mono"><code>{b.text}</code></pre>
            </div>
          );
          case "table": return (
            <div key={i} className="dx-table-wrap"><table className="dx-table">
              {b.head.length > 0 && <thead><tr>{b.head.map((c, k) => <th key={k}><InlineText text={c} /></th>)}</tr></thead>}
              <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}><InlineText text={c} /></td>)}</tr>)}</tbody>
            </table></div>
          );
        }
      })}
    </>
  );
}

const roleIcon = (roles: string) => (/admin|developer/i.test(roles) ? "shield" : "users");

/** One task (design 2.1): number, line, role chip, copy link · title · summary · then its blocks in the file's order. */
export function FunctionBlock({ fn }: { fn: Fn }) {
  let figN = 0;
  const fig: Fig = { next: () => `${fn.n}.${++figN}` };
  return (
    <article id={`fn-${fn.id}`} data-fn={fn.n} className="dx-fn">
      <header>
        <div className="top">
          <span className="num dx-mono">{String(fn.n).padStart(2, "0")}</span>
          <span className="line" />
          <span className="role"><MaskIcon name={roleIcon(fn.roles)} size={12} />{fn.roles}</span>
          <CopyTaskLink id={fn.id} title={fn.title} />
        </div>
        <h2>{fn.title}</h2>
        {fn.summary.length > 0 && <p className="summary"><InlineText text={fn.summary} /></p>}
      </header>
      <Blocks blocks={fn.blocks} fig={fig} />
    </article>
  );
}

export const plainText = (xs: Inline[]) => xs.map((x) => ("t" in x ? x.t : "")).join("");
