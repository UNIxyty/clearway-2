// The dashboard's blocks and each person's arrangement of them (portal redesign, stage 3 — "Page Dashboard").
// A layout is an ordered list of { id, size }: S, M and L are 4, 6 and 8 of the grid's 12 columns. It is saved on the
// account (user_preferences.dashboard_layout, docs/supabase-portal-dashboard.sql) and mirrored to this browser.
// null means "never customised" and shows the default; an empty list means every block was removed.

export const BLOCK_IDS = ["today", "recent", "monitors", "health", "links", "changelog"] as const;
export type BlockId = (typeof BLOCK_IDS)[number];
export type BlockSize = "S" | "M" | "L";
export type LayoutItem = { id: BlockId; size: BlockSize };
export type Layout = LayoutItem[];

export const SPAN: Record<BlockSize, number> = { S: 4, M: 6, L: 8 };

export const DEFAULT_LAYOUT: Layout = [
  { id: "today", size: "S" },
  { id: "recent", size: "L" },
  { id: "monitors", size: "M" },
  { id: "health", size: "M" },
  { id: "links", size: "S" },
  { id: "changelog", size: "L" },
];

/** A layout as stored, or null when the value is not one (bad JSON, unknown block, wrong size, duplicates). */
export function sanitizeLayout(input: unknown): Layout | null {
  if (!Array.isArray(input) || input.length > BLOCK_IDS.length) return null;
  const seen = new Set<string>();
  const out: Layout = [];
  for (const raw of input) {
    const id = (raw as { id?: unknown })?.id, size = (raw as { size?: unknown })?.size;
    if (typeof id !== "string" || !(BLOCK_IDS as readonly string[]).includes(id) || seen.has(id)) return null;
    if (size !== "S" && size !== "M" && size !== "L") return null;
    seen.add(id);
    out.push({ id: id as BlockId, size });
  }
  return out;
}
