// Files that should open in the document viewer the moment they arrive (passenger manifests). useThread marks a
// file id when it comes back LIVE in a turn; the file card takes the mark once and opens it. A reloaded conversation
// carries no marks, so old manifests never pop open again.
const pending = new Set<string>();
export function markForAutoOpen(id: string) { pending.add(id); }
export function takeAutoOpen(id: string): boolean { const had = pending.has(id); pending.delete(id); return had; }
