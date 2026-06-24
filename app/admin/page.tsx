import { redirect } from 'next/navigation';

// The unified admin console moved to /pickem/admin. Preserve old bookmarks,
// forwarding any ?section= so deep links keep working.
export default function Page({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const section = typeof searchParams.section === 'string' ? searchParams.section : null;
  redirect(section ? `/pickem/admin?section=${section}` : '/pickem/admin');
}
