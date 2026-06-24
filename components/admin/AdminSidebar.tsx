'use client';

/* =============================================================================
 * AdminSidebar — desktop fixed sidebar + mobile top bar & slide-in drawer.
 * Pure presentation: receives the active section and a select callback.
 * ===========================================================================*/
import { AnimatePresence, motion } from 'framer-motion';
import type { ComponentType, SVGProps } from 'react';

import type { AdminSection } from '@/types/admin';
import {
  ArrowIcon,
  BookIcon,
  CalendarIcon,
  CloseIcon,
  GridIcon,
  HomeIcon,
  ListIcon,
  LockIcon,
  MailIcon,
  MenuIcon,
  TableIcon,
  TrophyIcon,
} from './icons';

type NavItem = { id: AdminSection; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', Icon: HomeIcon },
  { id: 'bracket-setup', label: 'Bracket Setup', Icon: GridIcon },
  { id: 'results', label: 'Enter Results', Icon: TrophyIcon },
  { id: 'email-tools', label: 'Email Tools', Icon: MailIcon },
  { id: 'email-logs', label: 'Email Logs', Icon: ListIcon },
  { id: 'guide', label: 'Guide', Icon: BookIcon },
  { id: 'group-standings', label: 'Group Standings', Icon: TableIcon },
  { id: 'match-results', label: 'Group Matches', Icon: CalendarIcon },
  { id: 'pick-locks', label: 'Pick Locks', Icon: LockIcon },
];

export const SECTION_LABEL: Record<AdminSection, string> = NAV_ITEMS.reduce(
  (acc, { id, label }) => ({ ...acc, [id]: label }),
  {} as Record<AdminSection, string>,
);

type NavListProps = {
  active: AdminSection;
  onSelect: (id: AdminSection) => void;
  adminName: string;
  adminInitials: string;
};

function NavList({ active, onSelect, adminName, adminInitials }: NavListProps) {
  return (
    <div className="flex h-full flex-col">
      {/* brand */}
      <div className="px-4 pt-5 pb-4">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#f59e0b]">Admin Console</div>
        <div className="mt-0.5 text-[16px] font-bold text-white">WC2026 Pick&apos;em</div>
      </div>

      <div className="mx-4 border-t border-white/10" />

      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex h-10 w-full items-center gap-3 rounded-md px-4 text-[13px] font-semibold transition-colors ${
                    isActive ? 'bg-[#1E3A5F] text-white' : 'text-[#94A3B8] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[#1a56db]" />}
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* footer */}
      <div className="mx-4 border-t border-white/10" />
      <div className="flex items-center gap-3 px-4 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4d7c0f] text-[13px] font-extrabold text-white">
          {adminInitials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-white">{adminName}</div>
          <a href="/pickem" className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#94A3B8] transition-colors hover:text-white">
            Back to App <ArrowIcon className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

type AdminSidebarProps = NavListProps & {
  drawerOpen: boolean;
  onDrawerOpen: () => void;
  onDrawerClose: () => void;
};

export function AdminSidebar(props: AdminSidebarProps) {
  const { active, onSelect, drawerOpen, onDrawerOpen, onDrawerClose, adminName, adminInitials } = props;

  const handleSelect = (id: AdminSection) => {
    onSelect(id);
    onDrawerClose();
  };

  return (
    <>
      {/* desktop fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-[#0f1e3c] lg:block">
        <NavList active={active} onSelect={onSelect} adminName={adminName} adminInitials={adminInitials} />
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center bg-[#0f1e3c] px-4 lg:hidden">
        <button
          type="button"
          onClick={onDrawerOpen}
          aria-label="Open menu"
          className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <div className="flex-1 text-center text-[15px] font-bold text-white">{SECTION_LABEL[active]}</div>
      </header>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onDrawerClose}
            />
            <motion.aside
              key="drawer"
              className="fixed inset-y-0 left-0 z-50 w-[80vw] max-w-[300px] bg-[#0f1e3c] lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <button
                type="button"
                onClick={onDrawerClose}
                aria-label="Close menu"
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
              <NavList active={active} onSelect={handleSelect} adminName={adminName} adminInitials={adminInitials} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
