import type { Inline as InlineT } from "@/lib/docs/parse";
import { resolveLink } from "@/lib/docs/links";

// **UI label** → bold, `value` → a code chip that scales with the sentence (design 2.6), [text](address) → a link.
export function InlineText({ text }: { text: InlineT[] }) {
  return (
    <>
      {text.map((x, i) => {
        if (x.kind === "ui") return <strong key={i} className="dx-ui">{x.t}</strong>;
        if (x.kind === "code") return <code key={i} className="dx-code">{x.t}</code>;
        if (x.kind === "link") {
          const l = resolveLink(x.href);
          const external = /^https?:/i.test(l.href);
          return <a key={i} href={l.href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}><InlineText text={x.label} /></a>;
        }
        return <span key={i}>{x.t}</span>;
      })}
    </>
  );
}
