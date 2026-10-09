// Loading skeleton for a route's CONTENT only. The portal frame (sidebar, agent panel) is mounted once in the root
// layout and stays on screen while a page loads (portal foundations 3.1), so this draws nothing where the sidebar is:
// it used to draw a sidebar-shaped spacer, because every page used to bring its own sidebar.
export default function RouteSkeleton() {
  return (
    <div className="min-w-0 flex-1 bg-cw-page font-sans" aria-busy="true" aria-label="Loading">
      <div className="border-b border-cw-border bg-white/60 px-8 pb-[15px] pt-4">
        <div className="h-3 w-28 animate-pulse rounded bg-[#eceef1]" />
        <div className="mt-3 h-7 w-56 animate-pulse rounded-md bg-[#eceef1]" />
      </div>
      <div className="px-8 py-7">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-40 animate-pulse rounded-[14px] border border-cw-border bg-white" />
          <div className="h-40 animate-pulse rounded-[14px] border border-cw-border bg-white [animation-delay:120ms]" />
          <div className="h-64 animate-pulse rounded-[14px] border border-cw-border bg-white [animation-delay:240ms] lg:col-span-2" />
        </div>
      </div>
    </div>
  );
}
