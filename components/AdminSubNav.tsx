'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useIsAdmin } from '@/lib/hooks/useIsAdmin';

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/admin/playoffs/bracket-setup', label: 'Bracket Setup' },
  { href: '/admin/playoffs/results', label: 'Enter Results' },
  { href: '/admin/email-tools', label: 'Email Tools' },
];

/**
 * Secondary navigation for the pickem admin pages. Renders below the main app nav.
 * Gated by the same admin check as AdminRoute — invisible to non-admins.
 */
export function AdminSubNav() {
  const pathname = usePathname();
  const { isAdmin, loading } = useIsAdmin();
  if (loading || !isAdmin) return null;

  return (
    <div className="w-full bg-white border-b border-[#e5e7eb]" style={{ padding: '10px 24px' }}>
      <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
        <span className="text-[12px] font-bold uppercase tracking-wide text-navy">Admin</span>
        <span className="text-black/20">|</span>
        {LINKS.map(link => {
          const active = pathname === link.href || pathname.startsWith(link.href + '/');
          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                'px-3 py-1 rounded-full text-[12.5px] font-bold transition',
                active
                  ? 'bg-bk-blue text-white'
                  : 'bg-white text-navy hover:bg-[#f5f5f5]',
              ].join(' ')}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
