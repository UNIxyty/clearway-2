import type { HTMLAttributes, ReactNode } from "react";

// The page's content, inset like every portal page (2026-11-02): side padding from --cw-page-pad (app/globals.css: 32px
// at full width, 24px with the rail, 20px narrow) and 40px at the foot. One source: a page uses this instead of typing
// `padding: "0 var(--cw-page-pad) 40px"` itself (the older pages still do; they read the same variable).
export default function PageContent({ children, style, ...rest }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode; [data: `data-${string}`]: unknown }) {
  return <div {...rest} style={{ padding: "0 var(--cw-page-pad) 40px", ...style }}>{children}</div>;
}
