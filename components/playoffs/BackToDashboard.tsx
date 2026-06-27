/**
 * Consistent "← Dashboard" back link used across the /pickem/* pages that render
 * their own header (the Playoffs shell + standalone playoffs/admin pages). Muted
 * gray text + a left arrow, always visible (never tucked behind a hamburger), so
 * every page has the same one-tap route home to /pickem.
 */
export function BackToDashboard({ className = '' }: { className?: string }) {
  return (
    <a
      href="/pickem"
      className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-black/45 hover:text-black/70 transition-colors ${className}`}
    >
      <span aria-hidden className="text-[14px] leading-none">←</span>
      Dashboard
    </a>
  );
}
