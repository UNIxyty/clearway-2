import { Skel, SkeletonCards, TableShell, TableSkeleton, t } from './ui';
import WallDisplayPreview from '../wall-preview/WallDisplayPreview';
import { PAGE_META, TABLE_GRID, gridHeader } from './pageMeta';

// What a console page looks like before its data: the page title and its main button (known from the route, the
// button disabled), then a skeleton in the page's real shape. ConsoleApp draws this while the session is checked
// (`booting`); each page then draws the same skeleton in its own loading state, so the hand-over is seamless
// (wall console Stage 1, "Console Screen.dc.html" state=boot / loading).
// Names, actions and grids come from pageMeta.js, the same source the pages' TableShells read.
export default function PageSkeleton({ page }) {
  const meta = PAGE_META[page] || PAGE_META.flights;
  return (
    <div role="status" data-boot="true" aria-label={`Loading ${meta.title}`} aria-busy="true">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>{meta.title}</h2>
          <Skel w={260} h={12} style={{ margin: '3px 0' }} />
        </div>
        {meta.action && (
          <button type="button" disabled style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 600, padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--cw-disabled-bg)', color: 'var(--cw-text-disabled)', cursor: 'default', whiteSpace: 'nowrap' }}>
            {meta.action}
          </button>
        )}
      </div>
      {meta.kind === 'table' && TABLE_GRID[page] && (
        <TableShell columns={TABLE_GRID[page].columns} header={gridHeader(page)}>
          <TableSkeleton columns={TABLE_GRID[page].columns} />
        </TableShell>
      )}
      {meta.kind === 'notam' && (
        <>
          <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: '16px 20px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 18, boxShadow: t.shadow }}>
            <Skel w={70} h={26} still />
            <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--cw-bg-active)' }} />
            <Skel w={180} />
          </div>
          <SkeletonCards />
        </>
      )}
      {meta.kind === 'cards' && <SkeletonCards />}
      {meta.kind === 'settings' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: t.muted, whiteSpace: 'nowrap' }}>WALL DISPLAY · ITS OWN COLOURS AND FONT</span>
            <span style={{ flex: 1, borderTop: `1.5px dashed ${t.borderStrong}` }} />
          </div>
          <div style={{ border: `1.5px dashed ${t.borderStrong}`, borderRadius: 14, padding: 2, marginBottom: 18 }}>
            <WallDisplayPreview loading />
          </div>
          <SkeletonCards count={3} height={110} />
        </>
      )}
    </div>
  );
}
